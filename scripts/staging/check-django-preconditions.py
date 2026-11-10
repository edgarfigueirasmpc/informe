"""Read-only precondition check for the staging accounts. Changes NOTHING.

Run in the corporate Django management shell before create-django-test-users.py:
    python manage.py shell < check-django-preconditions.py

Answers the only three questions that can make the creation script fail:
the user model, whether the three `nube` groups exist, and whether the two
technical usernames are free. Prints no secrets and writes no files.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

WANTED_GROUPS = ['storage_nube_read', 'storage_nube_write', 'storage_nube_delete']
WANTED_USERS = ['mpc_cloud_test_writer', 'mpc_cloud_test_reader']

User = get_user_model()
problems = []

if User.USERNAME_FIELD != 'username':
    problems.append(f'The user model identifies by {User.USERNAME_FIELD!r}, not "username".')

existing_groups = set(Group.objects.filter(name__in=WANTED_GROUPS).values_list('name', flat=True))
for name in WANTED_GROUPS:
    mark = 'OK' if name in existing_groups else 'MISSING'
    print(f'  group {name:<24} {mark}')
    if name not in existing_groups:
        problems.append(f'Group {name!r} does not exist.')

taken = set(User.objects.filter(username__in=WANTED_USERS).values_list('username', flat=True))
for name in WANTED_USERS:
    mark = 'free' if name not in taken else 'ALREADY EXISTS'
    print(f'  user  {name:<24} {mark}')
    if name in taken:
        problems.append(f'Username {name!r} is taken; the creation script would refuse to run.')

print()
if problems:
    print('NOT READY. Nothing was changed. Reasons:')
    for problem in problems:
        print(f'  - {problem}')
else:
    print('READY: the three groups exist and both usernames are free. Nothing was changed.')
