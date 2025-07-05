#!/bin/bash
set -e

if [ -z "$1" ];
then
  echo "Error: No version specified."
  echo "Usage: ./release.sh <version>"
  exit 1
fi

VERSION=$1
ARCHIVE_NAME="ergodic"
DOWNLOADS_DIR="$HOME/Downloads"
RELEASE_ZIP_PATH="$DOWNLOADS_DIR/$ARCHIVE_NAME.zip"

echo "📦 Starting release process for version $VERSION..."

npm version $VERSION --no-git-tag-version --allow-same-version
echo "Building the plugin..."
npm run build

echo "Creating zip archive at $RELEASE_ZIP_PATH..."
TMP_DIR=$(mktemp -d)
cp main.js manifest.json styles.css "$TMP_DIR"
(cd "$TMP_DIR" && zip -r "$RELEASE_ZIP_PATH" .)
rm -rf "$TMP_DIR"

echo "Committing version changes and tagging..."
git add manifest.json versions.json package.json package-lock.json
git commit -m "chore(release): v$VERSION"
git tag "v$VERSION"

echo "✅ Successfully created release archive at $RELEASE_ZIP_PATH"
echo "👉 Don't forget to run 'git push && git push --tags' to publish the release."