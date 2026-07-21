# GustiMei

A hotel/restaurant recommendation web app based on users' ordinal preferences (rankings, not ratings).

No stars, no need of bad reviews to justify non-top ratings, no rate inflation.

It ranks places according to the rankings done by user with similar preferences: there are no "top places" that fit for everyone, just the places that most probably will fit user's preferences.

## How it should works

The recommendation system is a Ranking-based Collaborative Filtering/Sorting.

The user selects some places he/she visited, then is guided in sorting them in an ordered list based on overall preference.

With this data, the app matches users with similar preferences, then propose to the user a list of places sorted according to how matching users sorted them in their rankings.

## PROs

- It avoids rate inflation: in rating systems, often users avoid giving non-top ratings to avoid social friction. With ranking there is no such issue.



