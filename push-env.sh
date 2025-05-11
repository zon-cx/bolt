#!/bin/bash
APP_NAME=web  # Change to your app name if different

if [ ! -f .env ]; then
  echo ".env file not found!"
  exit 1
fi

while IFS='=' read -r key value
do
  # Ignore comments and empty lines
  if [[ ! "$key" =~ ^# && -n "$key" ]]; then
    # Remove possible quotes around value
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')
    echo "Setting $key"
    cf set-env "$APP_NAME" "$key" "$value"
  fi
done < .env

echo "All environment variables from .env have been set for $APP_NAME." 