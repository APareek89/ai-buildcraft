# Full application configuration

Start with `npm run demo` in the app root. It serves the bundled lessons without credentials, a database or external requests. The full authenticated app is separate and needs an operator-supplied database schema and private storage; this collection does not supply a complete fresh-database migration. The ownership migration in `migrations/` assumes pre-existing tables.

For an operator-managed installation:

- `DATABASE_URL` selects PostgreSQL/pgvector. Use verified TLS outside loopback development; `DATABASE_SSL=disable` is accepted only for loopback.
- `AUTH_SECRET` must contain at least 32 random characters. `APP_URL` must match the browser origin, and `PORT` defaults to 5070.
- `ALS_MOCK_MODE=1` blocks generation while retaining real authentication, stored reading and notebook routes.
- `STORAGE_BUCKET`, AWS credentials and `MEDIA_PUBLIC_BASE_URL=/media` configure private object storage and its authenticated proxy.
- `ALS_PRIMARY_PROVIDER=anthropic|openai` selects a single generation provider. Supply that provider's key and model IDs at runtime; missing configuration fails closed.
- Administrative access requires both `ADMIN_EMAILS` and a verified-email record. A fresh unverified signup cannot become an administrator merely by choosing an allowlisted address.

The `auth:claim` command is an operator tool for existing passwordless accounts. It requires privileged database access and writes a one-use claim link to a new private file outside the repository. Existing passwords cannot be replaced by this command. Email reset and Google sign-in are not implemented.

Repository input currently supports public repositories. Private repository authentication is not implemented. A scoped source upload is a separate input mechanism.

The collection checks are listed in [BUILDCRAFT.md](../BUILDCRAFT.md). Provider-wire tests mock SDK transports; they do not validate account permissions, billing, answer quality or a deployed application.
