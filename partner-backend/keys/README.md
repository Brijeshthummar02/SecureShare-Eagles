# RSA Keys Directory

This directory stores your RSA key pair for encrypting/decrypting data with the bank.

## Generate Keys

To generate a new RSA key pair:

```bash
# Generate private key (2048-bit RSA)
openssl genpkey -algorithm RSA -out private_key.pem -pkcs8 -pkeyopt rsa_keygen_bits:2048

# Generate public key from private key
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

## Key Files

- `private_key.pem` - Your private key (KEEP SECRET, used for decryption)
- `public_key.pem` - Your public key (share with bank for encryption)

## Security Notes

- **NEVER** commit private keys to git
- Store private keys securely
- Share only the public key with the bank
- Consider using environment variables for production

## Key Usage

1. **Registration**: Share `public_key.pem` content when registering with the bank
2. **Decryption**: The service uses `private_key.pem` to decrypt data from the bank
3. **Encryption**: Bank uses your public key to encrypt data sent to you
