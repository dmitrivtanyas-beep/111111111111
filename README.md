# Словничок — English, together

A paired English-learning workspace built with React, TypeScript, Vite and Supabase.

## Included in this starter

- Email/password authentication through Supabase Auth
- One shared workspace per account, with a maximum of two members
- Invite code creation and joining
- Shared vocabulary dictionary with quick entry, duplicate prevention, search, edit and delete
- Shared vocabulary attribution
- Private/shared notes with autosave, folder field, edit and delete
- Optional split-screen dictionary + notes layout
- Flashcard review queue with four self-assessment ratings
- Realtime subscriptions for words and notes
- Responsive desktop/mobile layout
- Row Level Security policies in `supabase/schema.sql`

## Setup

1. Create a project at https://supabase.com.
2. In Supabase, open **SQL Editor**, paste and run `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and anon/public key.
4. Copy `.env.example` to `.env` and fill in the values:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

5. Install and run:

   ```bash
   npm install
   npm run dev
   ```

6. Open the local URL shown by Vite, register the first user, and create a workspace.
7. In the profile menu, create an invitation code. The second person registers separately and enters that code.

## Important production notes

- Configure Supabase Auth email confirmation and SMTP according to your deployment needs.
- The app uses Supabase Row Level Security for workspace and private-note isolation. Test policies with two separate test accounts before using real personal notes.
- The invitation code is intentionally regenerated when requested; share it privately. For a public production app, consider adding expiry, rate limiting, and a dedicated invitation screen.
- The note editor currently provides plain text with autosave. Rich-text editing (headings, lists, bold, links) is a logical next iteration.
- The review scheduler is a lightweight starter algorithm, not a full SM-2 implementation.
- Add automated tests, error monitoring, backups, and deployment environment variables before production use.

## Deploy

You can deploy the Vite app to Vercel or Netlify. Add the two `VITE_SUPABASE_*` environment variables in the hosting dashboard. Supabase remains the backend/database/auth provider.
