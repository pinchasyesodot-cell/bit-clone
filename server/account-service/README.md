# account-service

Holds user accounts and balances, and executes the DEBIT / CREDIT / REFUND commands of the transfer saga.

## Manual testing

### Freeze an account (to fail a credit on purpose)

There is no API for changing an account's status. To test the refund flow, freeze the receiver directly in the database.

PowerShell:

```powershell
docker exec db-account mongosh bit-clone-account --quiet --eval "db.accounts.updateOne({ userId: '2' }, { `$set: { status: 'FROZEN' } })"
```

Bash:

```bash
docker exec db-account mongosh bit-clone-account --quiet --eval "db.accounts.updateOne({ userId: '2' }, { \$set: { status: 'FROZEN' } })"
```

To unfreeze it, run the same command with `status: 'ACTIVE'`.
