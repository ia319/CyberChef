const OPERATION_ACCESS = Object.freeze({
    DIRECT: "direct",
    APPROVAL: "approval",
    BLOCKED: "blocked",
    EXCLUDED: "excluded",
    UNREVIEWED: "unreviewed",
});

const DIRECT_OPERATION_NAMES = Object.freeze(`
A1Z26 Cipher Decode
A1Z26 Cipher Encode
ADD
AES Decrypt
AES Encrypt
AES Key Unwrap
AES Key Wrap
AMF Decode
AMF Encode
AND
Add line numbers
Add Text To Image
Adler-32 Checksum
Affine Cipher Decode
Affine Cipher Encode
Alternating Caps
Analyse hash
Analyse UUID
Argon2
Argon2 compare
Ascon Decrypt
Ascon Encrypt
Ascon Hash
Ascon MAC
Atbash Cipher
Avro to JSON
BLAKE2b
BLAKE2s
BLAKE3
BSON deserialise
BSON serialise
Bacon Cipher Decode
Bacon Cipher Encode
Bcrypt
Bcrypt compare
Bcrypt parse
Bifid Cipher Decode
Bifid Cipher Encode
Bit shift left
Bit shift right
Blowfish Decrypt
Blowfish Encrypt
Blur Image
Bombe
Bzip2 Compress
Bzip2 Decompress
CBOR Decode
CBOR Encode
CMAC
CRC Checksum
CSS Beautify
CSS Minify
CSS selector
CSV to JSON
CTPH
Caesar Box Cipher
Caret/M-decode
Cartesian Product
Cetacean Cipher Decode
Cetacean Cipher Encode
ChaCha
Change IP format
Chi Square
CipherSaber2 Decrypt
CipherSaber2 Encrypt
Citrix CTX1 Decode
Citrix CTX1 Encode
Colossus
Compare CTPH hashes
Compare SSDEEP hashes
Contain Image
Convert area
Convert co-ordinate format
Convert data units
Convert distance
Convert Image Format
Convert Leet Speak
Convert mass
Convert speed
Convert to NATO alphabet
Count occurrences
Cover Image
Crop Image
DES Decrypt
DES Encrypt
Dechunk HTTP response
Decode NetBIOS Name
Decode text
Defang IP Addresses
Defang URL
Derive EVP key
Derive HKDF key
Derive PBKDF2 key
Detect File Type
Disassemble ARM
Disassemble x86
Dither Image
Divide
Drop bytes
Drop nth bytes
ECDSA Signature Conversion
ECDSA Verify
ELF Info
Encode NetBIOS Name
Encode text
Enigma
Escape Smart Characters
Escape string
Escape Unicode Characters
Expand alphabet range
Extended GCD
Extract Audio Metadata
Extract dates
Extract domains
Extract EXIF
Extract email addresses
Extract file paths
Extract Files
Extract hashes
Extract ID3
Extract IP addresses
Extract LSB
Extract MAC addresses
Extract RGBA
Extract URLs
Fang URL
Fernet Decrypt
Fernet Encrypt
File Tree
Filter
Find / Replace
Flask Session Decode
Flask Session Verify
Fletcher-16 Checksum
Fletcher-32 Checksum
Fletcher-64 Checksum
Fletcher-8 Checksum
Flip Image
Format MAC addresses
From BCD
From Base
From Base32
From Base45
From Base58
From Base62
From Base64
From Base85
From Base92
From Bech32
From Binary
From Braille
From COBS
From Case Insensitive Regex
From Charcode
From Decimal
From Float
From HTML Entity
From Hex
From Hex Content
From Hexdump
From MessagePack
From Modhex
From Morse Code
From Octal
From Punycode
From Quoted Printable
From UNIX Timestamp
GOST Decrypt
GOST Encrypt
GOST Hash
GOST Key Unwrap
GOST Key Wrap
GOST Verify
Generate all checksums
Generate all hashes
Generate De Bruijn Sequence
Generate Image
Generate Lorem Ipsum
Generate QR Code
Generic Code Beautify
Get All Casings
Group IP addresses
Gunzip
Gzip
HAS-160
HASSH Client Fingerprint
HASSH Server Fingerprint
HMAC
HTML To Text
Hamming Distance
Haversine distance
Head
Hex to Object Identifier
Hex to PEM
IPv6 Transition Addresses
Image Brightness / Contrast
Image Filter
Image Hue/Saturation/Lightness
Image Opacity
Invert Image
JA3 Fingerprint
JA3S Fingerprint
JA4 Fingerprint
JA4Server Fingerprint
JPath expression
JSON Minify
JSON to CSV
JSON to YAML
JWK to PEM
JWT Decode
JWT Verify
JavaScript Beautify
JavaScript Minify
JavaScript Parser
Jq
Jsonata Query
Keccak
LM Hash
LS47 Decrypt
LS47 Encrypt
LZ4 Compress
LZ4 Decompress
LZMA Compress
LZMA Decompress
LZNT1 Decompress
LZString Compress
LZString Decompress
Levenshtein Distance
Lorenz
Luhn Checksum
MD2
MD4
MD5
MD6
MIME Decoding
MOD
Mean
Median
Microsoft Script Decoder
Modular Exponentiation
Modular Inverse
Multiple Bombe
Multiply
MurmurHash3
NOT
NT Hash
Normalise Image
Normalise Unicode
OR
Object Identifier to Hex
Optical Character Recognition
PEM to Hex
PEM to JWK
PGP Decrypt
PGP Decrypt and Verify
PGP Encrypt
PGP Verify
PHP Deserialize
PHP Serialize
P-list Viewer
PRESENT Decrypt
PRESENT Encrypt
Pad lines
Parity Bit
Parse ASN.1 hex string
Parse CSR
Parse IP range
Parse IPv6 address
Parse ObjectID timestamp
Parse QR Code
Parse SSH Host Key
Parse TLV
Parse UNIX file permissions
Parse URI
Parse User Agent
Parse X.509 CRL
Parse X.509 certificate
Play Media
Power Set
Protobuf Decode
Protobuf Encode
Pseudo-Random Integer Generator
Public Key from Certificate
Public Key from Private Key
RAKE
RC2 Decrypt
RC2 Encrypt
RC4
RC4 Drop
RC6 Decrypt
RC6 Encrypt
RIPEMD
ROR13
ROT13
ROT13 Brute Force
ROT47
ROT47 Brute Force
ROT8000
RSA Decrypt
RSA Encrypt
RSA Verify
Rabbit
Rail Fence Cipher Decode
Rail Fence Cipher Encode
Randomize Colour Palette
Raw Deflate
Raw Inflate
Regular expression
Remove ANSI Escape Codes
Remove Diacritics
Remove EXIF
Remove line numbers
Remove null bytes
Remove whitespace
Render Image
Resize Image
Reverse
Rison Decode
Rison Encode
Rotate Image
Rotate left
Rotate right
SHA0
SHA1
SHA2
SHA3
SIGABA
SM2 Decrypt
SM2 Encrypt
SM3
SM4 Decrypt
SM4 Encrypt
SQL Beautify
SQL Minify
SSDEEP
SUB
Salsa20
Scan for Embedded Files
Scrypt
Set Difference
Set Intersection
Set Union
Shake
Sharpen Image
Sleep
Snefru
Sort
Split
Split Colour Channels
Standard Deviation
Streebog
Strings
Strip HTML tags
Strip HTTP headers
Strip IPv4 header
Strip TCP header
Strip UDP header
Substitute
Subtract
Sum
Swap case
Swap endianness
Symmetric Difference
TCP/IP Checksum
TEA Decrypt
TEA Encrypt
Tail
Take bytes
Take nth bytes
Tar
Template
Text Encoding Brute Force
Text-Integer Conversion
To BCD
To Base
To Base32
To Base45
To Base58
To Base62
To Base64
To Base85
To Base92
To Bech32
To Binary
To Braille
To COBS
To Camel case
To Case Insensitive Regex
To Charcode
To Decimal
To Float
To HTML Entity
To Hex
To Hex Content
To Hexdump
To Kebab case
To Lower case
To MessagePack
To Modhex
To Morse Code
To Octal
To Punycode
To Quoted Printable
To Snake case
To UNIX Timestamp
To Upper case
Triple DES Decrypt
Triple DES Encrypt
Twofish Decrypt
Twofish Encrypt
Typex
UNIX Timestamp to Windows Filetime
URL Decode
URL Encode
Unescape string
Unescape Unicode Characters
Unicode Text Format
Unique
Untar
Unzip
VarInt Decode
VarInt Encode
View Bit Plane
Vigenère Decode
Vigenère Encode
Whirlpool
Windows Filetime to UNIX Timestamp
Wrap
XKCD Random Number
XML Beautify
XML Minify
XOR
XOR Brute Force
XOR Checksum
XPRESS Decompress
XPRESS LZ77+Huffman Decompress
XPath expression
XSalsa20
XTEA Decrypt
XTEA Encrypt
XXTEA Decrypt
XXTEA Encrypt
YAML to JSON
YARA Rules
Zip
Zlib Deflate
Zlib Inflate
`.trim().split(/\r?\n/u));

const APPROVAL_OPERATION_NAMES = Object.freeze([
    "ECDSA Sign",
    "Flask Session Sign",
    "Generate ECDSA Key Pair",
    "Generate PGP Key Pair",
    "Generate RSA Key Pair",
    "GOST Sign",
    "JWT Sign",
    "PGP Encrypt and Sign",
    "PGP Sign",
    "RSA Sign",
    "Generate HOTP",
    "Generate TOTP",
    "HTTP request",
    "DNS over HTTPS",
    "Render PDF",
    "Show on map",
    "Show Base64 offsets",
    "DateTime Delta",
    "Parse DateTime",
    "Translate DateTime Format",
    "Diff",
    "Entropy",
    "Frequency distribution",
    "Fuzzy Match",
    "Heatmap chart",
    "Hex Density chart",
    "Index of Coincidence",
    "JSON Beautify",
    "Offset checker",
    "Parse Ethernet frame",
    "Parse IPv4 header",
    "Parse TCP",
    "Parse TLS record",
    "Parse UDP",
    "Syntax highlighter",
    "To Table",
    "Get Time",
    "Pseudo-Random Number Generator",
    "Pseudo-Random Prime Generator",
    "Generate UUID",
    "Numberwang",
    "Shuffle",
    "Comment",
    "Conditional Jump",
    "Fork",
    "Jump",
    "Label",
    "Merge",
    "Return",
    "Subsection",
    "Register",
]);

const BLOCKED_OPERATION_NAMES = Object.freeze([
    "Magic",
    "Parse colour code",
    "Render Markdown",
    "Scatter chart",
    "Series chart",
]);

const EXCLUDED_OPERATION_NAMES = Object.freeze([
    "Automated Validation Test Op",
]);

const ACCESS_GROUPS = Object.freeze([
    Object.freeze({access: OPERATION_ACCESS.DIRECT, names: DIRECT_OPERATION_NAMES}),
    Object.freeze({access: OPERATION_ACCESS.APPROVAL, names: APPROVAL_OPERATION_NAMES}),
    Object.freeze({access: OPERATION_ACCESS.BLOCKED, names: BLOCKED_OPERATION_NAMES}),
    Object.freeze({access: OPERATION_ACCESS.EXCLUDED, names: EXCLUDED_OPERATION_NAMES}),
]);

const accessByName = new Map();
for (const group of ACCESS_GROUPS) {
    for (const operationName of group.names) {
        if (typeof operationName !== "string" || operationName.length === 0 ||
            accessByName.has(operationName)) {
            throw new RangeError("Operation access audit contains an invalid or duplicate name");
        }
        accessByName.set(operationName, group.access);
    }
}

const auditedNames = Object.freeze([...accessByName.keys()]);

const OPERATION_ACCESS_AUDIT = Object.freeze({
    size: auditedNames.length,

    /**
     * Reports whether an exact Operation name has an explicit access decision.
     *
     * @param {string} operationName - Exact Operation name.
     * @returns {boolean} Whether the name is present in the audit.
     */
    hasOperation(operationName) {
        return accessByName.has(operationName);
    },

    /**
     * Returns the reviewed access class for one exact Operation name.
     *
     * @param {string} operationName - Exact Operation name.
     * @returns {string} Reviewed access class or unreviewed for an unknown name.
     */
    getOperationAccess(operationName) {
        return accessByName.get(operationName) ?? OPERATION_ACCESS.UNREVIEWED;
    },

    /**
     * Returns every explicitly audited Operation name.
     *
     * @returns {string[]} Immutable audited name list.
     */
    getOperationNames() {
        return auditedNames;
    },
});

export {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
};
