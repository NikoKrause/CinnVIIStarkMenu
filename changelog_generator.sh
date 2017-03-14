#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ]
  then
    echo "usage: ./changelog_generator.sh <start_tag> <end_tag>"
    echo ""
    echo "example:"
    echo "    ./changelog_generator.sh v1.0 HEAD"
    exit
fi

export_to=CHANGES.md

echo "## Changelog" > $export_to
echo "> changes since: \`$1\`" >> $export_to
echo "" >> $export_to

git log $1...$2 --pretty=format:'* %s' --reverse | grep -v "Merge pull request" >> $export_to

echo "" >> $export_to
get_path=$(git config --get remote.origin.url | sed 's/.git//2' )
echo "[Full Changelog]($get_path/compare/$1...$2)" >> $export_to
