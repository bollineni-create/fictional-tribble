import type { Config } from "@netlify/functions";

// Scheduled function — runs daily, checks who needs job alerts
export default async () => {
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rapidApiKey = Netlify.env.get("RAPIDAPI_KEY");
  const mailgunApiKey = Netlify.env.get("MAILGUN_API_KEY");
  const mailgunDomain = Netlify.env.get("MAILGUN_DOMAIN");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log("Missing Supabase config, skipping job alerts");
    return;
  }

  try {
    // Get users with active alert preferences
    const now = new Date();
    const prefsRes = await fetch(
      `${supabaseUrl}/rest/v1/job_preferences?alert_frequency=neq.off&select=*`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    const prefs = await prefsRes.json();

    if (!prefs || prefs.length === 0) {
      console.log("No users with active alerts");
      return;
    }

    for (const pref of prefs) {
      // Check if it's time to send based on frequency
      const lastSent = pref.last_alert_sent ? new Date(pref.last_alert_sent) : null;
      const daysSinceLastAlert = lastSent
        ? Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      const shouldSend =
        (pref.alert_frequency === "weekly" && daysSinceLastAlert >= 7) ||
        (pref.alert_frequency === "monthly" && daysSinceLastAlert >= 30);

      if (!shouldSend) continue;

      // Get user's personal email
      const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${pref.user_id}`, {
        headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
      });

      if (!userRes.ok) continue;
      const userData = await userRes.json();
      const userEmail = userData.email;
      if (!userEmail) continue;

      // Search for matching jobs
      const titles = pref.desired_titles || [];
      if (titles.length === 0) continue;

      const query = titles[0]; // Use first desired title
      const location = (pref.desired_locations || [])[0] || "";

      let jobs: any[] = [];
      if (rapidApiKey) {
        try {
          const params = new URLSearchParams({
            query: location ? `${query} in ${location}` : query,
            page: "1",
            num_pages: "1",
          });
          if (pref.remote_ok) params.set("remote_jobs_only", "true");

          const jobRes = await fetch(
            `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
            {
              headers: {
                "X-RapidAPI-Key": rapidApiKey,
                "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
              },
            }
          );
          if (jobRes.ok) {
            const jobData = await jobRes.json();
            jobs = (jobData.data || []).slice(0, 5).map((j: any) => ({
              title: j.job_title,
              company: j.employer_name,
              location: j.job_city ? `${j.job_city}, ${j.job_state || ""}` : "Remote",
              url: j.job_apply_link,
            }));
          }
        } catch (err) {
          console.error("Job search error for alert:", err);
        }
      }

      if (jobs.length === 0) continue;

      // Build email digest
      const jobList = jobs.map((j: any) =>
        `- ${j.title} at ${j.company} (${j.location})\n  Apply: ${j.url}`
      ).join("\n\n");

      const emailBody = `Hi there!\n\nHere are new job matches based on your preferences:\n\n${jobList}\n\nYour preferences: ${titles.join(", ")}${location ? ` in ${location}` : ""}\n\nUpdate your preferences or turn off alerts at any time in your ResumeAI dashboard.\n\n— The ResumeAI Team`;

      // Send via Mailgun if configured
      if (mailgunApiKey && mailgunDomain) {
        try {
          const formData = new URLSearchParams();
          formData.append("from", `ResumeAI Alerts <alerts@${mailgunDomain}>`);
          formData.append("to", userEmail);
          formData.append("subject", `${jobs.length} new ${query} jobs matching your profile`);
          formData.append("text", emailBody);

          await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`api:${mailgunApiKey}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          });
        } catch (err) {
          console.error("Failed to send alert email:", err);
          continue;
        }
      } else {
        console.log(`Would send alert to ${userEmail}: ${jobs.length} jobs for ${query}`);
      }

      // Update last_alert_sent
      await fetch(
        `${supabaseUrl}/rest/v1/job_preferences?user_id=eq.${pref.user_id}`,
        {
          method: "PATCH",
          headers: {
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ last_alert_sent: now.toISOString() }),
        }
      );

      console.log(`Sent alert to ${userEmail}: ${jobs.length} jobs for ${query}`);
    }
  } catch (err) {
    console.error("Job alerts error:", err);
  }
};

export const config: Config = {
  schedule: "0 9 * * *", // Daily at 9 AM UTC
};
