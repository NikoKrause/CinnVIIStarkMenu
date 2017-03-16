#!/bin/bash

if [ -z "$1" ] || [ -z "$2" ]
  then
    echo "usage: ./changelog_generator.sh <start_tag> <end_tag>"
    echo ""
    echo "example:"
    echo "    ./changelog_generator.sh v1.0 HEAD"
    exit
fi


# Create changelog with git log command and save in CHANGES.md file
export_to=CHANGES.md

echo "## Changelog" > $export_to
echo "> changes since: \`$1\`" >> $export_to
echo "" >> $export_to

echo "\`\`\`" >> $export_to
git log $1...$2 --pretty=format:'[%an]%n* %s' --no-merges >> $export_to
echo "" >> $export_to
echo "\`\`\`" >> $export_to

get_path=$(git config --get remote.origin.url | sed 's/.git//2' )
echo "[Full Changelog]($get_path/compare/$1...$2)" >> $export_to


# if two consecutive commits are from the same author, delete unneccessary author name
i=5
j=$[$i+2]
lines=$(wc -l < $export_to)
printf "creating changelog..."

while [ $j -lt $lines ]
  do
    line1=$((awk "NR==$i" $export_to && awk "NR==$j" $export_to) | uniq | wc -l)
    if [ $line1 == 1 ]; then
        sed -i -e "${j}d" $export_to
        j=$[$j+1]
    else
        sed -i "${j}i\ " $export_to
        lines=$[$lines+1]
        i=$[$j+1]
        j=$[$i+2]
    fi
    printf "."
done

# remove trailing white spaces
sed -i 's/^\s\+//' $export_to

echo "done"
echo "Changelog was saved in $export_to."
