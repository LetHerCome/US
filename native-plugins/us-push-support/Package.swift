// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (Native Notifications V1). The package and product
// name must be "UsPushSupport": Capacitor CLI derives it from "@us/push-support".
let package = Package(
    name: "UsPushSupport",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsPushSupport",
            targets: ["UsPushSupportPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsPushSupportPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsPushSupportPlugin")
    ]
)
