// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin (Premi Sintonia V2, iOS Store V1). The package and
// product name must be "UsAppIcon": Capacitor CLI derives it from "@us/app-icon".
let package = Package(
    name: "UsAppIcon",
    platforms: [.iOS(.v16)],
    products: [
        .library(
            name: "UsAppIcon",
            targets: ["UsAppIconPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "UsAppIconPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/UsAppIconPlugin")
    ]
)
