-- Grant service_role full access to all existing and future tables in public schema
-- This fixes "permission denied for table products" with the service role key

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Ensure future tables also get service_role access by default
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant all privileges on functions to service_role;
