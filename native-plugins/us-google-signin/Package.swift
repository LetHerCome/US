// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (Accesso con Google; iOS since iOS Store V1). The
// package and product name must be "UsGoogleSignin": Capacitor CLI derives it
// from "@us/google-signin".
let package = Package(
    name: "UsGoogleSignin",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsGoogleSignin",
            targets: ["UsGoogleSignInPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsGoogleSignInPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsGoogleSignInPlugin")
    ]
)
