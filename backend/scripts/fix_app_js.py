#!/usr/bin/env python3
"""
Replace the malformed security block in src/app.js with a properly formatted block.
It looks for a line containing 'SECURITY:' and replaces everything up to the line
starting with 'app.get(' with the new block.
"""
from pathlib import Path
p = Path("src/app.js")
if not p.exists():
    print("src/app.js not found; run this from backend folder.")
    raise SystemExit(1)

text = p.read_text()
lines = text.splitlines()

# find start (line containing "SECURITY:")
start = None
for i, ln in enumerate(lines):
    if "SECURITY:" in ln:
        start = i
        break

# find end (first line that starts with "app.get(" after start)
end = None
if start is not None:
    for j in range(start+1, len(lines)):
        if lines[j].lstrip().startswith("app.get("):
            end = j
            break

if start is None:
    print("Could not find a line containing 'SECURITY:' in src/app.js. Aborting.")
    raise SystemExit(1)
if end is None:
    print("Could not find a subsequent line starting with 'app.get(' to anchor replacement. Aborting.")
    raise SystemExit(1)

new_block = [
"// --- SECURITY: basic hardening middleware (added by security/quick-hardening) ---",
"app.use(helmet());",
"",
"const corsWhitelist = [",
"  'http://localhost:3000',",
"  'http://127.0.0.1:3000',",
"  // add your deployed frontend origin(s) here when you deploy",
"];",
"",
"app.use(cors({",
"  origin: (origin, callback) => {",
"    // allow non-browser tools like curl/postman (null origin)",
"    if (!origin) return callback(null, true);",
"    if (corsWhitelist.indexOf(origin) !== -1) return callback(null, true);",
"    return callback(new Error('Not allowed by CORS'));",
"  },",
"  credentials: true",
"}));",
"",
"app.use(express.json());",
"",
"// Basic API rate limiter",
"const apiLimiter = rateLimit({",
"  windowMs: 60 * 1000, // 1 minute",
"  max: 200,            // per IP",
"  standardHeaders: true,",
"  legacyHeaders: false",
"});",
"app.use('/api/', apiLimiter);",
"// --- end security block ---",
""
]

# Build new lines: keep everything before start, then new_block, then from end onwards (including app.get line)
new_lines = lines[:start] + new_block + lines[end:]
p.write_text("\n".join(new_lines) + "\n")
print(f"Replaced lines {start+1}-{end} in src/app.js with security block. Backup is src/app.js.bak")
