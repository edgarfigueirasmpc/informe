"""Remove the two temporary staging accounts once the acceptance is finished.

Run in the corporate Django management shell:
    python manage.py shell < delete-django-test-users.py

Deletes ONLY the two technical usernames, and only after checking that each one
really is a technical account (not staff, not superuser). Any account that fails
that check is left untouched and reported. Groups and every other user are never
modified. Also removes the private credentials file if it is still around.
"""
import os
from django.contrib.auth import get_user_model
from django.db import transaction

WANTED_USERS = ['mpc_cloud_test_writer', 'mpc_cloud_test_reader']
CREDENTIALS = '/tmp/mpc-cloud-staging-accounts.private.json'

User = get_user_model()
borrables, intocables = [], []

for name in WANTED_USERS:
    user = User.objects.filter(username=name).first()
    if user is None:
        print(f'  {name:<24} not there (nothing to do)')
    elif user.is_staff or user.is_superuser:
        # Somebody promoted it, or the name belongs to a real person: do not touch it.
        intocables.append(name)
        print(f'  {name:<24} LEFT ALONE: it is staff or superuser, so it is not ours to delete')
    else:
        borrables.append(user)
        print(f'  {name:<24} will be deleted')

if borrables:
    with transaction.atomic():
        for user in borrables:
            user.delete()

if os.path.exists(CREDENTIALS):
    os.unlink(CREDENTIALS)
    print(f'  credentials file {CREDENTIALS} removed')

print()
print(f'Deleted {len(borrables)} technical account(s). No other user or group was modified.')
if intocables:
    print('Review by hand, nothing was done to them: ' + ', '.join(intocables))
