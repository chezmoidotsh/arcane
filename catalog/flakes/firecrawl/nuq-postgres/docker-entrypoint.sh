#!/bin/sh
set -e

# Data directory
PGDATA="/var/lib/postgresql/data"
PGRUN="/run/postgresql"
NUQ_MARKER="/var/lib/postgresql/.nuq_initialized"
export PGDATA PGRUN NUQ_MARKER

# Ensure data directory exists and has correct permissions
if [ ! -d "$PGDATA" ]; then
    mkdir -p "$PGDATA"
    chown -R postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
fi

# Ensure run directory exists and has correct permissions
if [ ! -d "$PGRUN" ]; then
    mkdir -p "$PGRUN"
    chown postgres:postgres "$PGRUN"
    chmod 700 "$PGRUN"
fi

# Initialize database if empty
if [ -z "$(ls -A "$PGDATA")" ]; then
    echo "Initializing database..."
    su postgres -c "initdb"

    # Configure pg_cron
    echo "shared_preload_libraries = 'pg_cron'" >> "$PGDATA/postgresql.conf"
    echo "cron.database_name = 'postgres'" >> "$PGDATA/postgresql.conf"

    # Start postgres temporarily to run init scripts
    su postgres -c "pg_ctl -D \"$PGDATA\" -w start"

    # Run nuq.sql
    if [ -f "/docker-entrypoint-initdb.d/nuq.sql" ]; then
        echo "Running nuq.sql..."
        su postgres -c "psql -v ON_ERROR_STOP=1 -d postgres -f /docker-entrypoint-initdb.d/nuq.sql"
        touch "$NUQ_MARKER"
        chown postgres:postgres "$NUQ_MARKER"
    fi

    su postgres -c "pg_ctl -D \"$PGDATA\" -m fast -w stop"
fi

# Apply schema on existing data if not yet applied
if [ ! -f "$NUQ_MARKER" ] && [ -f "/docker-entrypoint-initdb.d/nuq.sql" ]; then
    echo "Applying nuq.sql on existing database..."
    su postgres -c "pg_ctl -D \"$PGDATA\" -w start"
    su postgres -c "psql -v ON_ERROR_STOP=1 -d postgres -f /docker-entrypoint-initdb.d/nuq.sql"
    su postgres -c "pg_ctl -D \"$PGDATA\" -m fast -w stop"
    touch "$NUQ_MARKER"
    chown postgres:postgres "$NUQ_MARKER"
fi

# Start postgres
exec su postgres -c "postgres"
