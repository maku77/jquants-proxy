# JQuants Proxy

JQuants Proxy is a Cloudflare Worker that proxies requests to JQuants API.
This Worker is intended to be used by another Worker via Service Bindings.

## Environment Variables

The following environment variables needs to be set in .dev.env:

```conf
JQUANTS_API_EMAIL=<Email for JQuants API>
JQUANTS_API_PW=<Password for JQuants API>
```

For production, by using `wrangler secret` command, you can set the environment variables.

```console
$ wrangler secret put JQUANTS_API_EMAIL
$ wrangler secret put JQUANTS_API_PW
```

## Development (run locally)

```console
$ pnpm install
$ pnpm dev
```

## Deployment

```console
$ pnpm run deploy
```

