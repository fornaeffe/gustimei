\set ON_ERROR_STOP on

-- Supply RUNTIME_DB_PASSWORD, MIGRATION_DB_PASSWORD, BACKUP_DB_PASSWORD, and
-- OPERATOR_DB_PASSWORD with psql -v. Fixed role names avoid identifier injection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gustimei_runtime') THEN
    CREATE ROLE gustimei_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gustimei_migration') THEN
    CREATE ROLE gustimei_migration LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gustimei_backup') THEN
    CREATE ROLE gustimei_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gustimei_operator') THEN
    CREATE ROLE gustimei_operator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

SELECT format('ALTER ROLE gustimei_runtime PASSWORD %L', :'RUNTIME_DB_PASSWORD') \gexec
SELECT format('ALTER ROLE gustimei_migration PASSWORD %L', :'MIGRATION_DB_PASSWORD') \gexec
SELECT format('ALTER ROLE gustimei_backup PASSWORD %L', :'BACKUP_DB_PASSWORD') \gexec
SELECT format('ALTER ROLE gustimei_operator PASSWORD %L', :'OPERATOR_DB_PASSWORD') \gexec

GRANT CONNECT ON DATABASE :"DB_NAME" TO gustimei_runtime, gustimei_migration, gustimei_backup, gustimei_operator;
GRANT USAGE ON SCHEMA public TO gustimei_runtime, gustimei_backup, gustimei_operator;
GRANT ALL ON SCHEMA public TO gustimei_migration;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gustimei_migration;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gustimei_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gustimei_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gustimei_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gustimei_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gustimei_operator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gustimei_operator;

ALTER DEFAULT PRIVILEGES FOR ROLE gustimei_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gustimei_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE gustimei_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gustimei_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE gustimei_migration IN SCHEMA public
  GRANT SELECT ON TABLES TO gustimei_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE gustimei_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gustimei_operator;
