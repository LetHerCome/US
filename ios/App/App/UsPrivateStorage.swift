import Foundation

/// Privacy-sensitive storage policy (mirror of Android allowBackup=false).
///
/// The Supabase session lives in the WebView's IndexedDB under
/// Library/WebKit. Excluding that directory from iCloud/Finder backups means
/// a restored or migrated device never inherits a live refresh token: the
/// user signs in again. Caches are already excluded by iOS.
enum UsPrivateStorage {
    static func excludeWebDataFromBackup(fileManager: FileManager = .default) {
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        var webKit = library.appendingPathComponent("WebKit", isDirectory: true)
        do {
            try fileManager.createDirectory(at: webKit, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try webKit.setResourceValues(values)
        } catch {
            NSLog("[US] WebKit backup exclusion failed: %@", error.localizedDescription)
        }
    }
}
