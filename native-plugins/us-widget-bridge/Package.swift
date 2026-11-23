// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (iOS widgets, 14/11/2026). The package and product
// name must be "UsWidgetBridge": Capacitor CLI derives it from "@us/widget-bridge".
// The files under Core/ are Foundation-only and are also compiled into the
// widget extension (ios/App/UsWidgets), which cannot link Capacitor.
let package = Package(
    name: "UsWidgetBridge",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsWidgetBridge",
            targets: ["UsWidgetBridgePlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsWidgetBridgePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsWidgetBridgePlugin")
    ]
)
