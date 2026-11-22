#!/usr/bin/env bash
# Put Video Map online with Firebase Hosting, from a phone.
#
# Run it in Google Cloud Shell, where the Firebase tool is installed and already
# signed in to your Google account:
#
#   bash video-map/tools/firebase-deploy.sh my-project-id
#
# Use a Firebase project made for this app. Publishing replaces whatever website
# the project already serves, so this script refuses to do that by accident.
set -euo pipefail
cd "$(dirname "$0")/.."

project="${1:-${GOOGLE_CLOUD_PROJECT:-${DEVSHELL_PROJECT_ID:-}}}"
if [ -z "$project" ]; then
  echo "Which Firebase project? Add its ID to the end of the command, for example:"
  echo "  bash video-map/tools/firebase-deploy.sh my-project-id"
  echo
  echo "Your projects:"
  firebase projects:list || true
  exit 1
fi

address="https://${project}.web.app/"
page="$(curl -sL --max-time 20 "$address" || true)"

if printf '%s' "$page" | grep -q '<title>Video Map</title>'; then
  echo "Video Map is already at $address. Updating it."
elif printf '%s' "$page" | grep -qi 'Site Not Found'; then
  echo "Nothing is published at $address yet. Publishing Video Map there."
else
  if [ -z "$page" ]; then
    echo "Could not check what is at $address right now."
  else
    echo "STOP. $address already shows a different website."
    echo "Publishing here would REPLACE that website with Video Map."
  fi
  echo "The safe choice is a new Firebase project made only for this app."
  read -r -p "To publish to \"$project\" anyway, type REPLACE: " answer
  if [ "$answer" != "REPLACE" ]; then
    echo "Nothing was changed."
    exit 1
  fi
fi

firebase deploy --only hosting --project "$project"
echo
echo "Done. Open $address in Safari, then Share > Add to Home Screen."
