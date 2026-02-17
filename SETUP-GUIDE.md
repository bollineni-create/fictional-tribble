# ResumeAI — Complete Setup Guide

## What You're Building

A fully functional AI Resume & Cover Letter builder website with:
- Landing page with pricing
- AI-powered resume & cover letter generation
- Free tier (3/day) with paid Pro tier ($9/mo)
- Stripe payments for subscriptions
- Deployed free on Netlify

---

## STEP 1: Get Your Anthropic API Key (5 minutes)

This is the AI engine behind your app.

1. Go to https://console.anthropic.com
2. Click "Sign Up" and create a free account
3. Once logged in, click "API Keys" in the left sidebar
4. Click "Create Key" and name it "ResumeAI"
5. **COPY the key immediately** — you won't see it again
   - It looks like: `sk-ant-api03-xxxxxxxxxxxx...`
6. Save it somewhere safe (Notes app, password manager, etc.)

**Cost:** You get $5 in free credits to start. Each resume generation costs roughly $0.003–$0.01, so $5 gets you about 500–1,500 generations — plenty to launch and get your first paying users.

---

## STEP 2: Create a GitHub Account (5 minutes)

GitHub stores your code and connects to Netlify for auto-deployment.

1. Go to https://github.com and click "Sign Up"
2. Choose a username, enter your email, create a password
3. Complete the verification steps

---

## STEP 3: Upload Your Code to GitHub (10 minutes)

### Option A: Using GitHub's Website (Easiest — No Coding Tools Needed)

1. Log into GitHub
2. Click the **"+"** button in the top-right → **"New repository"**
3. Name it `resumeai`
4. Make sure "Public" is selected
5. Check **"Add a README file"**
6. Click **"Create repository"**

Now upload each file:

7. Click **"Add file"** → **"Upload files"**
8. Drag and drop ALL the files from the project folder I created:
   - `netlify.toml`
   - `package.json`
   - `.gitignore`

9. Click **"Commit changes"**

10. Now create the folders. Click **"Add file"** → **"Create new file"**
11. In the filename field, type: `public/index.html`
    - This automatically creates the `public` folder
12. Paste the contents of the `index.html` file
13. Click **"Commit changes"**

14. Click **"Add file"** → **"Create new file"** again
15. Type: `netlify/functions/generate.mts`
16. Paste the contents of the `generate.mts` file
17. Click **"Commit changes"**

### Option B: Using Command Line (If You Have Git Installed)

```bash
cd /path/to/resumeai
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/resumeai.git
git push -u origin main
```

---

## STEP 4: Deploy to Netlify for Free (10 minutes)

1. Go to https://app.netlify.com
2. Click **"Sign up"** → **"Sign up with GitHub"**
3. Authorize Netlify to access your GitHub
4. Once on the dashboard, click **"Add new site"** → **"Import an existing project"**
5. Select **"GitHub"**
6. Find and select your `resumeai` repository
7. Netlify will auto-detect your settings. Verify:
   - **Build command:** (leave blank)
   - **Publish directory:** `public`
8. Click **"Deploy site"**

### Add Your API Key to Netlify

9. Once deployed, go to **Site configuration** → **Environment variables**
10. Click **"Add a variable"**
11. Set:
    - **Key:** `ANTHROPIC_API_KEY`
    - **Value:** paste your API key from Step 1
12. Click **"Save"**
13. Go to **Deploys** → click **"Trigger deploy"** → **"Deploy site"**

### Get Your Free URL

Your site is now live at something like: `https://random-name-12345.netlify.app`

To customize the URL:
1. Go to **Site configuration** → **Site details** → **Change site name**
2. Change it to something like `resumeai-pro` 
3. Your site is now at: `https://resumeai-pro.netlify.app`

---

## STEP 5: Add Stripe Payments ($9/mo Subscription) (20 minutes)

### Create Stripe Account

1. Go to https://stripe.com and click "Start now"
2. Complete signup (you'll need your bank details for payouts)
3. Once in the dashboard, you'll be in **Test Mode** (toggle in top-right)

### Create Your $9/mo Product

4. Go to **Products** → **"Add product"**
5. Fill in:
   - **Name:** "ResumeAI Pro"
   - **Description:** "Unlimited AI resume & cover letter generations"
   - **Price:** $9.00 / month (recurring)
6. Click **"Save product"**

### Create a Payment Link

7. Go to **Payment Links** → **"New"**
8. Select your "ResumeAI Pro" product
9. Under **"After payment"**, set redirect to: `https://YOUR-SITE.netlify.app/?upgraded=true`
10. Click **"Create link"**
11. Copy the payment link (looks like: `https://buy.stripe.com/xxxxx`)

### Connect Payment Link to Your Site

12. Open your `public/index.html` file on GitHub
13. Click the pencil icon to edit
14. Find this line:
    ```javascript
    onclick="alert('Stripe checkout will be connected here! See setup guide.')"
    ```
15. Replace it with:
    ```javascript
    onclick="window.open('https://buy.stripe.com/YOUR_LINK_HERE', '_blank')"
    ```
16. Also find BOTH instances of the upgrade button text and update similarly
17. Commit the changes — Netlify will auto-redeploy!

### Go Live with Stripe

18. When ready for real payments, toggle from "Test mode" to "Live mode" in Stripe
19. Create the same product/payment link in live mode
20. Update the payment link in your code

---

## STEP 6: Get a Custom Domain (Optional — $12/year)

A custom domain like `resumeai.com` looks more professional.

1. Buy a domain from https://namecheap.com or https://porkbun.com (~$10-12/yr)
   - Try: `resumeai.app`, `myresumeai.com`, `getresumeai.com`, etc.
2. In Netlify, go to **Domain management** → **"Add a custom domain"**
3. Enter your domain name
4. Netlify will give you DNS records to add
5. Go to your domain registrar and update the DNS nameservers to Netlify's
6. Wait 15-30 minutes for DNS to propagate
7. Netlify automatically adds a free SSL certificate (HTTPS)

---

## STEP 7: Track Paid Users (Important!)

Right now the app uses a simple daily counter. To properly gate Pro features:

### Simple Approach: Stripe Customer Portal

Add a "Manage Subscription" link that goes to Stripe's hosted portal.
Pro users can manage their billing there.

### Better Approach: Add Supabase (Free Auth + Database)

1. Go to https://supabase.com and create a free project
2. Use Supabase Auth for user login/signup
3. Store subscription status in a Supabase table
4. Use Stripe Webhooks to update subscription status automatically

This is a more advanced step — when you're ready, I can build this out for you!

---

## STEP 8: Get Your First Users (Marketing)

### Free Traffic Sources (do these FIRST)

1. **Reddit** — Post helpful resume tips in r/jobs, r/resumes, r/careeradvice
   - Don't spam your link. Give real advice, then mention your tool naturally
   - "I actually built a free tool for this: [link]"

2. **TikTok / YouTube Shorts** — Record your screen using the tool
   - "I built an AI that writes your resume in 30 seconds"
   - Show before/after of a bad resume → AI-generated one
   - These can go viral easily

3. **Twitter/X** — Share the tool in career-related threads
   - "Built a free AI resume builder. Paste a job description, get a tailored resume. [link]"

4. **Product Hunt** — Launch there for a burst of traffic
   - Go to https://producthunt.com, create a maker account
   - Schedule a launch and ask friends to upvote

5. **SEO Content** — Write blog posts targeting keywords:
   - "Free AI resume builder"
   - "How to write a cover letter with AI"
   - "ATS-friendly resume template free"
   - Add a `/blog` section to your site

### Paid Traffic (once you have revenue)

6. **Google Ads** — Target "resume builder" keywords ($1-3/click)
7. **Facebook/Instagram Ads** — Target job seekers (age 22-40)

---

## Cost Breakdown

| Item | Monthly Cost |
|------|-------------|
| Netlify hosting | $0 (free tier) |
| Anthropic API (first month) | $0 (free credits) |
| Anthropic API (ongoing) | ~$5-20/mo depending on usage |
| Custom domain | ~$1/mo ($12/year) |
| Stripe fees | 2.9% + $0.30 per transaction |
| **Total to start** | **$0** |

### Revenue Math

| Scenario | Monthly Revenue |
|----------|----------------|
| 10 Pro subscribers | $90/mo |
| 25 Pro subscribers | $225/mo |
| 50 Pro subscribers | $450/mo |
| 100 Pro subscribers | $900/mo |
| 250 Pro subscribers | $2,250/mo |

At 50 subscribers your API costs are roughly $10-20/mo, so you'd net ~$420+/mo.

---

## Maintenance Checklist (3-5 hrs/week)

- [ ] Check Stripe dashboard for new subscribers
- [ ] Monitor Anthropic API usage/costs
- [ ] Post 2-3 times per week on social media
- [ ] Reply to any user feedback/emails
- [ ] Write 1 SEO blog post per week (optional but high impact)
- [ ] Test the site monthly to make sure everything works

---

## Troubleshooting

**"API key not configured" error:**
→ Make sure you added ANTHROPIC_API_KEY in Netlify's Environment Variables and redeployed

**Site shows blank page:**
→ Check that your publish directory is set to `public` in Netlify

**Stripe payments not working:**
→ Make sure you're using LIVE mode links (not test mode) for real payments

**AI generates weird/bad results:**
→ The prompts in `generate.mts` can be tuned — adjust the system prompt for better output

---

## Next Level Features (When You're Ready)

When you're making consistent revenue, consider adding:

1. **DOCX/PDF Export** — Use a library to generate downloadable files (big Pro selling point)
2. **User Accounts** — Let users save and edit previous resumes
3. **Multiple Templates** — Different visual layouts for resumes
4. **ATS Score Checker** — Analyze how well a resume matches a job posting
5. **LinkedIn Import** — Pull experience data from LinkedIn profiles
6. **Interview Prep** — AI-generated interview questions based on the job

I can help you build any of these when you're ready!
