# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Forky, please report it responsibly.

### How to Report

**Do NOT open a public issue for security vulnerabilities.**

Instead, please send an email to: **joseluis@codefriends.es**

Include the following information:
- Type of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment:** Within 48 hours
- **Initial Assessment:** Within 7 days
- **Resolution Timeline:** Depends on severity, typically 30-90 days

### Severity Levels

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Remote code execution, data breach | 24-48 hours |
| High | Privilege escalation, significant data exposure | 7 days |
| Medium | Limited impact vulnerabilities | 30 days |
| Low | Minor issues, hardening suggestions | 90 days |

## Security Considerations

Forky is a desktop Git client that:
- Accesses local Git repositories
- May store SSH credentials in system keychain
- Connects to remote Git servers (GitHub, GitLab, etc.)

### Best Practices for Users

1. **Keep Forky updated** to the latest version
2. **Use SSH keys** instead of passwords when possible
3. **Review repository permissions** before opening untrusted repos
4. **Don't run Forky as root/administrator** unless necessary

## Acknowledgments

We appreciate security researchers who help keep Forky safe. Contributors who report valid security issues will be acknowledged here (with permission).

---

Thank you for helping keep Forky and its users safe.
