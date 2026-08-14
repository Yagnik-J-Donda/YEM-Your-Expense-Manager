# YEM – Your Expense Manager

An advanced browser-based expense tracker built with HTML, CSS and JavaScript.

## Features

- Fixed and variable expense categories
- Monthly allowances and itemized projections
- Credit and debit entries
- Category suggestions based on personal history and an offline catalogue
- Search, filters, projected-expense breakdowns and historical views
- Recycle Bin, JSON backup export/import and local-only data storage

## Data and privacy

Expense data is stored in the browser using `localStorage`. Export a JSON backup regularly if the data is important. Cloud login does not upload existing financial records yet; migration will be a separate, reviewed feature.

## Cloud login setup

YEM includes a Supabase email/password sign-in foundation for private owner-only access.

1. Create a separate Supabase project for YEM.
2. In **Authentication > Providers**, keep Email enabled and disable new-user sign-ups.
3. Create the owner account in **Authentication > Users**.
4. Copy the project URL and publishable (or legacy anon) key from **Project Settings > API** into `supabase-config.js`.
5. Open `login.html` and sign in with the owner account.

The login screen intentionally has no public Create Account option. Never add the Supabase `service_role` key to this repository.

## Run locally

Open `index.html` directly, or serve this folder with any static web server.

---

## Portfolio

🌐 [View My Portfolio](https://yagnik-j-donda.github.io/portfolio/)
