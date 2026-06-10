fn main() {
    // The macOS video backend links a Swift bridge (the `screencapturekit`
    // crate). A dependency's build script can't add link args to THIS package's
    // binaries, so the Swift-runtime rpaths must be emitted here or the app
    // aborts at load with `dyld: Library not loaded: @rpath/libswift_*.dylib`.
    // `/usr/lib/swift` covers end-user machines (in the OS since macOS 12); the
    // Xcode toolchain paths cover dev/CI hosts (harmlessly absent elsewhere).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        if let Ok(output) = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
        {
            if output.status.success() {
                let xcode = String::from_utf8_lossy(&output.stdout).trim().to_string();
                println!(
                    "cargo:rustc-link-arg=-Wl,-rpath,{xcode}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx"
                );
                println!(
                    "cargo:rustc-link-arg=-Wl,-rpath,{xcode}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx"
                );
            }
        }
    }
    tauri_build::build()
}
