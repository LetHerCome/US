// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (Accedi con Apple, iOS Store V1). The package and
// product name must be "UsAppleSignin": Capacitor CLI derives it from
// "@us/apple-signin".
let package = Package(
    name: "UsAppleSignin",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsAppleSignin",
            targets: ["UsAppleSignInPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsAppleSignInPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsAppleSignInPlugin")
    ]
)
