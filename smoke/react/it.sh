#!/bin/sh
set -ex
projectRoot=$(pwd)
cd smoke/react
smokeDir=$(pwd)
tmpDir=$(mktemp -d)
rm -rf node_modules dist pnpm-lock.yaml
cp -pr * $tmpDir
cd $tmpDir
cp $projectRoot/dist/npmrc-smoke .npmrc
rm -rf pnpm-lock.yaml node_modules
#fp_core=$(echo $smokeDir/../../dist/fireproof-core/fireproof-core-*.tgz)
#use_fp=$(echo $smokeDir/../../dist/use-fireproof/use-fireproof-*.tgz)
#sed -e "s|FIREPROOF_CORE|file://$fp_core|g" \
#    -e "s|USE_FIREPROOF|file://$use_fp|g" package-template.json > package.json
cp package-template.json package.json
#ls -la .npmrc
#cat package.json
#env | sort > $projectRoot/dist/smoke.react.env
unset npm_config_registry
# pnpm install
pnpm install use-fireproof@$(cat $projectRoot/dist/fp-version.txt) --prefer-offline --package-import-method=hardlink
pnpm why react
cat package.json
# pnpm install -f "file://$smokeDir/../../dist/fireproof-core/fireproof-core-*.tgz"
# pnpm install -f "file://$smokeDir/../../dist/use-fireproof/use-fireproof-*.tgz"
# pnpm run test > /dev/null 2>&1 || true
pnpm run test
if [ -z "$NO_CLEANUP" ]
then
  rm -rf $tmpDir
else
  echo $tmpDir
fi
