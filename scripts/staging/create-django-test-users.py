"""Run ONLY in the corporate Django management shell:
python manage.py shell -c "exec(open('/tmp/create-django-test-users.py').read())"
Creates precisely the two approved NEW technical users; never reuses an existing user.
Writes passwords only to a mode-0600 file. Existing groups/permissions are not modified.
"""
import json
import os
import secrets
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction

output = '/tmp/mpc-cloud-staging-accounts.private.json'
spec = {
    'writer': ('mpc_cloud_test_writer', ['storage_nube_read', 'storage_nube_write', 'storage_nube_delete']),
    'reader': ('mpc_cloud_test_reader', ['storage_nube_read']),
}
User = get_user_model()
assert User.USERNAME_FIELD == 'username', 'Unexpected corporate user model; do not improvise account creation.'
assert not os.path.exists(output), 'Credential file already exists; refusing to replace it.'
assert not User.objects.filter(username__in=[v[0] for v in spec.values()]).exists(), 'A requested username already exists: nothing changed.'
groups = {name: Group.objects.get(name=name) for name in {g for _, gs in spec.values() for g in gs}}
credentials = {role: {'username': name, 'password': secrets.token_urlsafe(36)} for role, (name, _) in spec.items()}
# O_EXCL and mode 0600, before changing the database; no secret printed by this script.
fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with transaction.atomic():
        for role, (name, group_names) in spec.items():
            user = User.objects.create_user(username=name, password=credentials[role]['password'], is_staff=False, is_superuser=False, is_active=True)
            user.groups.set([groups[n] for n in group_names])
        with os.fdopen(fd, 'w') as f:
            json.dump(credentials, f)
            f.flush()
            os.fsync(f.fileno())
except BaseException:
    os.unlink(output)
    raise
print('Two technical test users created. Private credentials: ' + output + ' (0600). No existing user modified.')
