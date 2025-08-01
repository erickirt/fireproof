#!/bin/sh
set -ex
projectRoot=$(pwd)
cd smoke/npm
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
cp * $tmpDir || true
cd $tmpDir
cp $projectRoot/dist/npmrc-smoke .npmrc
rm -rf pnpm-lock.yaml node_modules
cp package-template.json package.json
# pnpm install
pnpm add @fireproof/core@$(cat $projectRoot/dist/fp-version.txt) --prefer-offline --package-import-method=hardlink
pnpm add @fireproof/core-runtime@$(cat $projectRoot/dist/fp-version.txt) --prefer-offline --package-import-method=hardlink
cat package.json
npx tsx ./node-test.ts
command -v deno && \
  deno run --allow-read --allow-write --allow-env --unstable-sloppy-imports ./node-test.ts
  # deno run --config node_modules/@fireproof/core/deno.json --allow-read --allow-write --allow-env --unstable-sloppy-imports ./node-test.ts

pnpm run cli writeEnv --fromEnv HOME --out - --json

if [ -z "$NO_CLEANUP" ]
then
  rm -rf $tmpDir
else
  echo $tmpDir
fi
