import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const TIER_LIMITS: Record<string, number> = { free: 5, pro: 25, max: 999 };

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rapidApiKey = Netlify.env.get("RAPIDAPI_KEY");
  if (!rapidApiKey) {
    return new Response(
      JSON.stringify({ error: "Job search API not configured. Set RAPIDAPI_KEY in Netlify env vars." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    query, location, remote, page = 1,
    userSkills, desiredTitle, desiredLocation,
    datePosted, employmentTypes, jobRequirements, radius, companyTypes,
  } = body;
  if (!query) {
    return new Response(
      JSON.stringify({ error: "Search query is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- CHECK TIER STATUS ----
  let tier = "free";
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    tier = await checkTier(authHeader);
  }
  const dailyLimit = TIER_LIMITS[tier] || TIER_LIMITS.free;

  // ---- RATE LIMITING ----
  const clientIp = context.ip || req.headers.get("x-forwarded-for") || "unknown";
  const ipHash = await hashIp(clientIp);
  const today = new Date().toISOString().split("T")[0];
  const rateLimitKey = `jobs:${ipHash}:${today}`;

  try {
    const store = getStore("rate-limits");
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (dailyCount >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: tier === "free"
            ? "You've used your 5 free job searches today. Upgrade for more!"
            : `You've reached your ${dailyLimit} daily searches. Upgrade to Max for unlimited!`,
          limitReached: true,
          tier,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- CHECK CACHE ----
    const cacheKey = `jobcache:${await hashString(`${query}|${location || ''}|${remote || ''}|${page}|${datePosted || ''}|${employmentTypes || ''}|${jobRequirements || ''}|${radius || ''}`)}`;
    const cacheStore = getStore("job-cache");
    const cached = await cacheStore.get(cacheKey, { type: "json" });
    if (cached && Date.now() < cached.expiresAt) {
      // Update usage even for cached results
      await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });
      return new Response(
        JSON.stringify({
          jobs: cached.jobs,
          totalResults: cached.totalResults,
          remaining: dailyLimit - dailyCount - 1,
          cached: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- SEARCH JSEARCH API ----
    const params = new URLSearchParams({
      query: location ? `${query} in ${location}` : query,
      page: String(page),
      num_pages: "1",
    });
    if (remote) params.set("remote_jobs_only", "true");
    if (datePosted) params.set("date_posted", datePosted); // all, today, 3days, week, month
    if (employmentTypes) params.set("employment_types", employmentTypes); // FULLTIME, CONTRACTOR, PARTTIME, INTERN
    if (jobRequirements) params.set("job_requirements", jobRequirements); // under_3_years_experience, more_than_3_years_experience, no_experience, no_degree
    if (radius) params.set("radius", String(radius)); // km radius from location
    if (companyTypes) params.set("company_type", companyTypes); // Finance, Information, etc.

    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
      {
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("JSearch API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "Job search temporarily unavailable. Please try again." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const jobs = (data.data || []).map((job: any) => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      companyLogo: job.employer_logo,
      location: job.job_city
        ? `${job.job_city}, ${job.job_state || ""} ${job.job_country || ""}`.trim()
        : job.job_country || "Remote",
      isRemote: job.job_is_remote,
      salary: formatSalary(job),
      description: job.job_description,
      highlights: job.job_highlights,
      applyUrl: job.job_apply_link,
      source: job.job_publisher,
      postedAt: job.job_posted_at_datetime_utc,
      employmentType: job.job_employment_type,
    }));

    // ---- MATCH SCORING ----
    if (userSkills && Array.isArray(userSkills) && userSkills.length > 0) {
      for (const job of jobs) {
        job.matchScore = calculateMatchScore(job, userSkills, desiredTitle || query, desiredLocation || location);
      }
      // Sort by match score descending
      jobs.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    const totalResults = data.total_count || jobs.length;

    // Cache for 24 hours
    await cacheStore.setJSON(cacheKey, {
      jobs,
      totalResults,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Update usage
    await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });

    return new Response(
      JSON.stringify({
        jobs,
        totalResults,
        remaining: dailyLimit - dailyCount - 1,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Job search error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

function calculateMatchScore(
  job: any,
  userSkills: string[],
  desiredTitle: string,
  desiredLocation: string
): number {
  let score = 0;
  const desc = ((job.description || "") + " " + (job.title || "")).toLowerCase();
  const normalizedSkills = userSkills.map((s: string) => s.toLowerCase().trim());

  // Skill match (60% weight) — count how many user skills appear in the job description
  const matchedSkills = normalizedSkills.filter((skill: string) => {
    // Handle multi-word skills
    return desc.includes(skill);
  });
  const skillScore = normalizedSkills.length > 0
    ? (matchedSkills.length / normalizedSkills.length) * 60
    : 30; // neutral if no skills

  // Title match (25% weight) — fuzzy match between desired title and job title
  const jobTitleLower = (job.title || "").toLowerCase();
  const desiredWords = desiredTitle.toLowerCase().split(/\s+/).filter(Boolean);
  const titleMatched = desiredWords.filter((w: string) => jobTitleLower.includes(w));
  const titleScore = desiredWords.length > 0
    ? (titleMatched.length / desiredWords.length) * 25
    : 12;

  // Location match (15% weight)
  let locationScore = 7; // neutral default
  if (desiredLocation && desiredLocation.trim()) {
    const jobLoc = (job.location || "").toLowerCase();
    const desiredLoc = desiredLocation.toLowerCase().trim();
    if (jobLoc.includes(desiredLoc) || desiredLoc.includes(jobLoc.split(",")[0])) {
      locationScore = 15;
    } else if (job.isRemote) {
      locationScore = 12; // remote is usually a good match
    } else {
      locationScore = 3;
    }
  }

  score = Math.round(skillScore + titleScore + locationScore);
  return Math.min(100, Math.max(0, score));
}

function formatSalary(job: any): string {
  const min = job.job_min_salary;
  const max = job.job_max_salary;
  const period = job.job_salary_period;

  if (!min && !max) return "";
  if (min && max) return `$${formatNum(min)} - $${formatNum(max)}${period ? `/${period.toLowerCase()}` : ""}`;
  if (min) return `From $${formatNum(min)}${period ? `/${period.toLowerCase()}` : ""}`;
  return `Up to $${formatNum(max)}${period ? `/${period.toLowerCase()}` : ""}`;
}

function formatNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n);
}

async function checkTier(authHeader: string): Promise<string> {
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return "free";
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) return "free";
    const user = await userRes.json();
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro,tier`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    if (!profileRes.ok) return "free";
    const profiles = await profileRes.json();
    if (profiles.length === 0) return "free";
    const p = profiles[0];
    if (p.tier) return p.tier;
    return p.is_pro ? "pro" : "free";
  } catch { return "free"; }
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "resumeai-salt-2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export const config: Config = {
  path: "/api/search-jobs",
};
