# Survey Stair Climb - Version 10

## Setup

```bash
npm install
npm run dev
```

## Create Supabase Tables

Run these tables in the Supabase SQL editor.

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  created_at timestamp default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  room_code text,
  nickname text,
  answer text,
  created_at timestamp default now()
);
```

## Deploy to Cloudflare Pages

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```
