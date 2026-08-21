# folvyn-portfolio-ms

> Portfolio data microservice. Public reads for the portfolio site, authenticated CRUD for the admin app.
> A pure resource server — it verifies AWS Cognito tokens and owns no auth logic of its own.

[![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47a248?style=flat-square&logo=mongodb)](https://mongoosejs.com)
[![AWS](https://img.shields.io/badge/AWS-Lambda%20%C2%B7%20Cognito-ff9900?style=flat-square&logo=amazonwebservices)](https://github.com/MKirell/folvyn-platform-iac)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)

**Live:** <https://folvyn.mkirell.com/api/v1>

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Related repositories](#related-repositories)
- [License](#license)
- [Author](#author)

## Overview

One data domain, two access levels:

| Consumer              | Access                           | Auth                           |
| --------------------- | -------------------------------- | ------------------------------ |
| `folvyn-portfolio-mf` | Read the portfolio               | None — public                  |
| `folvyn-console-mf`   | Full CRUD over the same entities | Cognito — bearer token + scope |

Access control is enforced **here**, not in the frontends. A global `JwtAuthGuard` denies by default and
public reads opt out with `@Public()`, so a new endpoint is protected even if you forget to decorate it.

Authent**ication** is not implemented here at all. This service verifies access tokens signed by the
Cognito user pool and reads the scopes inside them. It holds no user table, no password, no federated-IdP
secret, no signing key and no refresh-token store — so the next microservice inherits single sign-on by
pointing at the same pool instead of copying this code.

## Architecture

```text
folvyn-portfolio-mf ──► GET /portfolio ─────┐
                                             │
folvyn-console-mf   ──► /admin/* + token ───┤
                                             ▼
                                    API Gateway (folvyn.mkirell.com/api)
                                             │
                                    Lambda (container image)
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                             ▼
                      MongoDB Atlas M0              Cognito JWKS
                      (content)                     (token verification)
```

The same container image runs on **Lambda or Fargate** unchanged. The Dockerfile bundles the AWS Lambda
Web Adapter, so the app is an ordinary HTTP server either way and moving between them is a Terraform
variable, not a code change.

## Tech stack

| Layer      | Choice                                                  |
| ---------- | ------------------------------------------------------- |
| Runtime    | Node.js 22, NestJS 11, TypeScript strict                |
| Database   | MongoDB via Mongoose, MongoDB Atlas M0 in production    |
| Auth       | AWS Cognito, Passport JWT, `jwks-rsa`                   |
| Validation | `class-validator` + `ValidationPipe`                    |
| Hardening  | Helmet, `@nestjs/throttler`, custom sanitize middleware |
| Tests      | Jest                                                    |
| Packaging  | Docker + AWS Lambda Web Adapter                         |

## Quick start

**Prerequisites** — Node.js 22+, Docker (for MongoDB).

```bash
npm install
docker run -d -p 27017:27017 --name folvyn-mongo mongo:7.0
npm run dev
```

Serves <http://localhost:3000/api/v1> against a local MongoDB. Public reads work immediately.

To exercise the authenticated routes, fetch a token from the real pool with the client-credentials grant —
no browser, no user, no password:

```bash
curl -s -X POST https://auth.mkirell.com/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=<ci client id>' \
  --data-urlencode 'client_secret=<terraform output -raw cognito_ci_client_secret>' \
  -d 'scope=folvyn-portfolio-ms/admin'
```

### Scripts

```bash
npm run dev          # watch mode
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, zero warnings tolerated
npm test             # jest
npm run test:cov     # jest with coverage
npm run check        # typecheck + lint + format + test
```

## Configuration

The service is the same binary in both environments. What changes is where it reads data and which
origins it trusts.

| Variable                     | Development                 | Production           |
| ---------------------------- | --------------------------- | -------------------- |
| `NODE_ENV`                   | `development`               | `production`         |
| `MONGODB_URI`                | `mongodb://127.0.0.1:27017` | the Atlas cluster    |
| `MONGODB_DB_NAME`            | `folvyn_portfolio`          | same                 |
| `CORS_ORIGINS`               | localhost ports             | `folvyn.mkirell.com` |
| `COGNITO_REGION`             | `eu-west-3`                 | same                 |
| `COGNITO_USER_POOL_ID`       | the real pool               | the same pool        |
| `COGNITO_ALLOWED_CLIENT_IDS` | app client allowlist        | same                 |
| `COGNITO_HOSTED_UI_DOMAIN`   | `https://auth.mkirell.com`  | same                 |

**Development** reads `.env.development`, which is **committed** — it contains only a localhost database
URL and public identifiers, nothing secret. Personal overrides go in `.env.development.local`, which is
gitignored.

There is one Cognito pool. Development trusts the same tokens production does, so a token that works
locally works in production — there is no second identity provider to keep in sync.

**Production has no `.env.production` file, deliberately.** Every production setting is injected into the
Lambda by Terraform, which is the only place that knows the Atlas connection string and the resolved
Cognito IDs. A committed production env file would either duplicate those values and drift, or leak the
database credentials. Configuration comes from the platform, not from a file in the repository.

To run locally _as_ production — against Atlas, to reproduce a data-shaped bug — create
`.env.production.local` (gitignored):

```bash
cd ../folvyn-platform-iac/terraform/main
terraform output -raw mongodb_uri     # paste into .env.production.local
cd -
NODE_ENV=production npm run start:prod
```

## API reference

Base path `/api/v1`.

### Public

```http
GET /portfolio              # default language
GET /portfolio?lang=fr
GET /portfolio/:lang
GET /portfolio/languages
GET /health
GET /auth/config            # issuer, pool id, SPA client id and scopes
```

`GET /portfolio` returns one assembled, **language-resolved** document — translations flattened onto each
entity, no translation maps, no parallel arrays:

```jsonc
{
  "lang": "en",
  "availableLangs": [{ "code": "en", "label": "EN", "flagCode": "gb" }],
  "person": { "name": "…", "jobTitle": "…", "resume": "resume_en_mkzrelly.pdf" },
  "ui": { "nav": {}, "headings": {}, "labels": {}, "hero": {}, "shell": {} },
  "about": { "paragraphs": [], "stats": [] },
  "experiences": [],
  "projects": [],
  "skillCategories": [],
  "education": { "degrees": [], "certifications": [], "spokenLanguages": [] },
  "achievements": { "volunteering": [], "awards": [] },
}
```

Asset fields are **filenames**, not binaries — the frontend resolves them against its own `public/files/`
and `public/imgs/`.

### Protected

Every route below requires a Cognito access token carrying the `folvyn-portfolio-ms/admin` scope.

```http
GET  | PUT | PATCH           /admin/person
GET  | PUT | PATCH | DELETE  /admin/ui-strings/:lang
GET  | POST                  /admin/{entity}
GET  | PATCH | DELETE        /admin/{entity}/:id
PATCH                        /admin/{entity}/reorder
GET  | POST | PATCH | DELETE /admin/locales[/:id]
GET                          /auth/me
```

`{entity}` ∈ `experiences` · `projects` · `skill-categories` · `about-stats` · `degrees` ·
`certifications` · `spoken-languages` · `volunteering` · `awards`

Sign-in, sign-out, consent and refresh all happen at Cognito. No endpoint here issues a token.

### Testing the HTTP surface

There is no Postman collection. Every route is covered by **supertest suites that drive the real Nest
application** — `admin-controllers.spec.ts`, `access-control.spec.ts`, `uploads.spec.ts` and the rest —
so requests, validation, auth, tenant isolation and the negative cases all run on `npm test` and in CI.

```bash
npm test
```

A hand-maintained collection was deleted because it had gone quietly wrong: it still spoke to Keycloak,
still called `/admin/ui-strings`, and still used the single-tenant `/portfolio` routes. A test that
lies is worse than no test, and a suite that runs on every commit cannot drift the same way.

## Data model

Content is normalized. Each asset lives on the entity it belongs to, and translated text sits in a
per-language map, so deleting one job can never silently reassign the certificate below it:

```jsonc
// experiences
{
  "order": 1,
  "current": false,
  "company": "VERMEG for Banking & Insurance Software", // language-neutral
  "tags": ["PyTorch", "PaddleOCR"], // language-neutral
  "doc": "internship-cert-vermeg.pdf",
  "link": "https://www.linkedin.com/company/vermeg/",
  "translations": {
    "en": { "period": "02/2024 — 06/2024", "role": "…", "bullets": ["…"] },
    "fr": { "period": "02/2024 — 06/2024", "role": "…", "bullets": ["…"] },
  },
}
```

| Collection         | Kind      | Notes                                           |
| ------------------ | --------- | ----------------------------------------------- |
| `person`           | singleton | Identity, contact, assets; per-language resumes |
| `locales`          | list      | Drives the available languages                  |
| `ui_strings`       | one/lang  | Nav, headings, labels, hero, shell, footer copy |
| `about_stats`      | list      |                                                 |
| `experiences`      | list      |                                                 |
| `projects`         | list      |                                                 |
| `skill_categories` | list      |                                                 |
| `degrees`          | list      |                                                 |
| `certifications`   | list      |                                                 |
| `spoken_languages` | list      |                                                 |
| `volunteering`     | list      |                                                 |
| `awards`           | list      |                                                 |

Every list entity carries an explicit `order`, so sequence is data rather than an accident of insertion.

## Project structure

```text
src/
├── main.ts             # helmet, cors, global pipes
├── app.module.ts       # global guards, throttler, sanitizer
├── config/             # typed namespaces + Joi validation
├── database/
├── common/
│   ├── decorators/     # @Public, @Roles, @CurrentUser
│   ├── guards/         # JwtAuthGuard, RolesGuard
│   ├── filters/        # AllExceptionsFilter
│   ├── middleware/     # SanitizeMiddleware
│   ├── services/       # BaseCrudService<T>
│   └── dto/            # ReorderDto, IsTranslationMap
├── auth/               # verification only, no issuance
│   ├── roles.ts
│   ├── oidc-claims.ts  # token claims → AuthenticatedUser
│   ├── jwks.provider.ts    # cached, rate-limited JWKS client
│   └── strategies/     # cognito.strategy.ts
├── health/
└── portfolio/
    ├── portfolio.service.ts   # language resolver
    ├── person/  locale/  ui-strings/  about/
    ├── experience/  project/  skill/
    └── education/  achievement/       # each: schema, dto, service, controller
```

## Testing

```bash
npm test
npm run test:cov
```

No database and **no AWS account** required. The suite generates a throwaway RSA keypair and signs its own
Cognito-shaped tokens, so token verification is exercised for real against a stand-in JWKS.

| Area           | What is covered                                                                          |
| -------------- | ---------------------------------------------------------------------------------------- |
| Resolver       | Language flattening, translation maps never leak, Mongo bookkeeping stripped, fallback   |
| Claims         | Roles from scopes and groups, other resource servers' scopes ignored, id tokens rejected |
| Access control | Public reads open, writes 401 unauthenticated, 403 for non-admin, forged tokens rejected |
| Auth endpoints | `/auth/config` leaks no secret, `/auth/me` echoes the token identity                     |
| Sanitizer      | Operator and dotted-key stripping across body, query and params                          |
| CRUD           | Every admin controller and DTO over HTTP, including reorder batches                      |
| Config         | Required variables, pool-id and region formats, asymmetric-algorithm guard               |
| Error filter   | Status mapping with no stack traces or driver internals leaked                           |

## Deployment

Push to `develop` deploys dev; push to `main` deploys production. Both run the checks first, then the
release:

1. **checks** — typecheck, lint, format check, unit suite with its coverage gate
2. **e2e** — the API exercised end to end against a seeded database
3. **secrets** — the tree scanned for anything that looks like a credential
4. **deploy** — build the image, push to `folvyn-portfolio-ms`, roll the function onto it, smoke-test
   `/health`

Production never builds its own image: it promotes the digest dev already verified, and refuses if no
image carries that commit.

Every job writes a summary, so a run can be read from its Summary tab without opening a log.

Two repository variables control it, both written by Terraform:

| Variable               | Effect                             |
| ---------------------- | ---------------------------------- |
| `CI_ENABLED=false`     | turns the whole workflow off       |
| `DEPLOY_ENABLED=false` | keeps the checks, skips the deploy |

CI holds no AWS key — it assumes an IAM role through OIDC. When a required variable is missing the
pipeline **fails loudly** rather than skipping silently.

## Security

**Authentication is delegated, entirely.** Cognito federates Google, owns the session and signs the
tokens. This service verifies them and nothing else.

**Token verification** — RS256 only, against the pool's published JWKS, cached and rate-limited so a key
rotation is picked up without a redeploy. `iss` must be this user pool, `exp` is enforced, and `token_use`
must be `access` so an id token cannot be replayed as an access token. Cognito access tokens carry no
`aud`, so the `client_id` claim is checked against an explicit allowlist instead — a token minted for a
different application is refused even though the same pool signed it. Configuration rejects symmetric
algorithms outright: a resource server must never hold a key it could sign with.

**Authorization is per-service** — access requires the `folvyn-portfolio-ms/admin` scope from this
service's own Cognito resource server, or membership of the `admin` group. A scope belonging to another
resource server is ignored, so being an admin of one Folvyn service never implies being an admin of this
one. Revocation takes effect within one access-token lifetime.

**Nothing to steal here** — no user table, no password, no OAuth client secret, no signing key, no refresh
tokens at rest. The environment holds only a region, a pool id and public client ids.

**Hardening** — Helmet with a strict API CSP and HSTS in production; rate limiting; CORS restricted to an
explicit origin allowlist with no wildcard and credentials off, since the service sets no cookies;
`ValidationPipe` with `whitelist` and `forbidNonWhitelisted` on every write; middleware stripping
`$`-prefixed and dotted keys from body, query and params; and an exception filter returning a stable
envelope with no stack traces, driver internals or Mongo errors.

## Related repositories

| Repository                                                            | Role                             |
| --------------------------------------------------------------------- | -------------------------------- |
| [folvyn-portfolio-mf](https://github.com/MKirell/folvyn-portfolio-mf) | The public site, reads this API  |
| [folvyn-platform-iac](https://github.com/MKirell/folvyn-platform-iac) | Terraform for every AWS resource |

## License

[Apache 2.0](LICENSE)

## Author

**Mohamed Khalil ZRELLY** — [LinkedIn](https://www.linkedin.com/in/mohamed-khalil-zrelly/) ·
[mkirell.com](https://mkirell.com/)
