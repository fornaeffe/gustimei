# GustiMei

A hotel/restaurant recommendation web app based on users' ordinal preferences (rankings, not ratings).

No stars, no need of bad reviews to justify non-top ratings, no rate inflation.

It ranks places according to the rankings done by user with similar preferences: there are no "top places" that fit for everyone, just the places that most probably will fit user's preferences.

## How it works

The recommendation system is a Ranking-based Collaborative Filtering/Sorting.

The user selects some places he/she visited, then is guided in sorting them in an ordered list based on overall preference.

With this data, the app matches users with similar preferences, then propose to the user a list of places sorted according to how matching users sorted them in their rankings.

## PROs

- It avoids rate inflation: in rating systems, often users avoid giving non-top ratings to avoid social friction. With rankings there is no such issue.

- Users' preferences differ, and sorting is done per-user according to his/her preferences. A hotel that could be a top rating for a user, may be not optimal for another.

- It's easy to buy some hundreds of "five star" rating, it's much harder to buy hundreds of interconnecting rankings.

## Tech stack

Svelte 5
SvelteKit
BetterAuth
Drizzle
Postgres (dockerized in development)

i18n: Paraglide
theming and components: Tailwind (with `@theme` directive) + Bits.UI where needed


## Implementation steps

- Project setup - DONE
- Schema and db seeding

## Decisions

## Open questions





