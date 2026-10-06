// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (Native Security V1). The package and product name
// must be "UsAppLock": Capacitor CLI derives it from "@us/app-lock".
let package = Package(
    name: "UsAppLock",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsAppLock",
            targets: ["UsAppLockPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsAppLockPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsAppLockPlugin")
    ]
)
