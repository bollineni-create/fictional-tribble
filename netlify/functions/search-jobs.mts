import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const FREE_DAILY_LIMIT = 5;

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

  const { query, location, remote, page = 1 } = body;
  if (!query) {
    return new Response(
      JSON.stringify({ error: "Search query is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- CHECK PRO STATUS ----
  let isPro = false;
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    isPro = await checkProStatus(authHeader);
  }

  // ---- RATE LIMITING ----
  const clientIp = context.ip || req.headers.get("x-forwarded-for") || "unknown";
  const ipHash = await hashIp(clientIp);
  const today = new Date().toISOString().split("T")[0];
  const rateLimitKey = `jobs:${ipHash}:${today}`;

  try {
    const store = getStore("rate-limits");
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (!isPro && dailyCount >= FREE_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "You've used your 5 free job searches today. Upgrade to Pro for unlimited!",
          limitReached: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- CHECK CACHE ----
    const cacheKey = `jobcache:${await hashString(`${query}|${location || ''}|${remote || ''}|${page}`)}`;
    const cacheStore = getStore("job-cache");
    const cached = await cacheStore.get(cacheKey, { type: "json" });
    if (cached && Date.now() < cached.expiresAt) {
      // Update usage even for cached results
      await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });
      return new Response(
        JSON.stringify({
          jobs: cached.jobs,
          totalResults: cached.totalResults,
          remaining: isPro ? 999 : FREE_DAILY_LIMIT - dailyCount - 1,
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
        remaining: isPro ? 999 : FREE_DAILY_LIMIT - dailyCount - 1,
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

async function checkProStatus(authHeader: string): Promise<boolean> {
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return false;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    if (!profileRes.ok) return false;
    const profiles = await profileRes.json();
    return profiles.length > 0 && profiles[0].is_pro;
  } catch {
    return false;
  }
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
