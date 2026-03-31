# EXIF Sorter Smoke Check

Run these checks from the repository root.

## 1. Preview Health

Confirm the web runtime has the expected EXIF sorter env:

```bash
bash -lc "tr '\0' '\n' < /proc/$(pgrep -f 'next dev' | head -n1)/environ | rg '^(IMG_EXPORT_DATA|IMG_EXPORT_TARGET|S3_ENDPOINT|S3_REGION|S3_BUCKET|S3_ACCESS_KEY|S3_SECRET_KEY)='"
```

Confirm preview succeeds with env-only source selection:

```bash
curl -sS "${APP_BASE_URL%/}/api/exif_sorter/preview" \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{}' > /tmp/exif_preview.json
```

Confirm current expected dataset size, truncation, unknown count, and attribution counts:

```bash
node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync('/tmp/exif_preview.json','utf8')); const items=Array.isArray(data.items)?data.items:[]; const summary=items.reduce((acc,item)=>{ const reason=Array.isArray(item?.decision?.reason)?item.decision.reason:[]; const strategy=item?.decision?.strategy; if(strategy==='gps_date') acc.gps_date+=1; else if(strategy==='date_only' && reason.includes('using_file_mtime')) acc.mtime_fallback+=1; else if(strategy==='date_only') acc.exif_date_only+=1; else if(strategy==='unknown') acc.unknown+=1; return acc; },{gps_date:0,exif_date_only:0,mtime_fallback:0,unknown:0}); console.log(JSON.stringify({ok:data.ok,count:data.count,truncated:data.truncated,...summary},null,2));"
```

Expected:

- `ok: true`
- `count: 118`
- `truncated: false`
- `unknown: 0`
- `gps_date`, `exif_date_only`, and `mtime_fallback` are informational attribution counts

## 2. Apply Safety

Run the route integration regression suite:

```bash
node --test --import tsx apps/web/app/api/exif_sorter/apply/route.test.ts
```

This must verify:

- normal copy succeeds
- normal move succeeds
- `../escape` fails with `Invalid destination path`
- `/escape` fails with `Invalid destination path`
- source outside `IMG_EXPORT_DATA` fails with `Invalid source path`

## 3. Storage / displayUrl Spot Check

Fetch one sampled display URL from the public dev photo listing:

```bash
curl -sS "${APP_BASE_URL%/}/api/dev/photos?limit=1" > /tmp/dev_photos.json
node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync('/tmp/dev_photos.json','utf8')); const url=data?.items?.[0]?.asset?.displayUrl; if(!url){process.exit(1)} console.log(url);"
```

Check object delivery:

```bash
curl -sS -D /tmp/display_headers.txt -o /tmp/display_body.bin "$(node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync('/tmp/dev_photos.json','utf8')); process.stdout.write(data.items[0].asset.displayUrl)")"
sed -n '1,20p' /tmp/display_headers.txt
```

Expected:

- status `200`
- `content-type: image/...`
- `content-length` present

## 4. Pass / Fail Interpretation

Blocker failures:

- preview request fails
- preview `count` does not match the current expected dataset size
- preview `truncated` is `true`
- preview `unknown` is not `0`
- apply route integration test fails
- sampled `displayUrl` does not return `200`
- sampled `displayUrl` does not return `content-type: image/*`

Informational values:

- `gps_date`
- `exif_date_only`
- `mtime_fallback`
- exact sampled `content-length`
