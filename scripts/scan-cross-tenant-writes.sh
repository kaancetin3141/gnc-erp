#!/bin/bash
# Tarama: superadmin bypass'lı guard + create(data.tenantId=user.tenantId) kombinasyonu
# Bu kombinasyon = superadmin çapraz-tenant yazmada yanlış tenant sahipliği
cd /home/z/my-project
echo "=== BYPASS GUARD + CREATE OWN-TENANT kombinasyonu olan dosyalar ==="
for f in $(rg -l "user!.role !== 'superadmin'|user.role !== 'superadmin'" src/app/api --glob 'route.ts' | sort); do
  # dosyada create/upsert var mı ve create data bloğunda tenantId: user var mı
  if rg -q "\.create\(|\.upsert\(" "$f" 2>/dev/null; then
    # create bloğu içinde tenantId: user geçiyor mu (kaba tarama: create'ten sonraki 15 satır)
    hits=$(rg -A15 "\.create\(\{" "$f" | rg -c "tenantId: user" || true)
    if [ "${hits:-0}" -gt 0 ]; then
      echo "$f  (create bloklarında own-tenantId: $hits)"
    fi
  fi
done
echo "=== TAMAMLANDI ==="
