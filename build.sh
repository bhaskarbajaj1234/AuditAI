#!/bin/bash
set -e

echo "=== Building Frontend ==="
cd Frontend
npm install --include=dev
npm run build
cd ..

echo "=== Installing Backend & Bundling ==="
cd BackEnd
npm install --include=dev
cd ..

echo "=== Creating Serverless API ==="
mkdir -p api
npx esbuild BackEnd/src/app.ts --bundle --platform=node --target=node20 --format=cjs --outfile="api/[...all].js"