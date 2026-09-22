#ifndef PHP_BRIDGE_H
#define PHP_BRIDGE_H

#include <string>
#include <vector>
#include <map>

class PhpBridge {
public:
    static PhpBridge& getInstance();

    bool initialize();
    void shutdown();

    // Evaluate raw PHP code snippet and return output/result
    std::string evalPhp(const std::string& code);

    // Run Laravel Artisan command (e.g. ['artisan', 'migrate', '--force'])
    std::string runArtisan(const std::vector<std::string>& args, const std::string& projectPath);

    // Dispatch an HTTP request into Laravel's public/index.php
    std::string dispatchLaravel(
        const std::string& method,
        const std::string& uri,
        const std::map<std::string, std::string>& headers,
        const std::string& body,
        const std::string& projectPath
    );

private:
    PhpBridge();
    ~PhpBridge();
    PhpBridge(const PhpBridge&) = delete;
    PhpBridge& operator=(const PhpBridge&) = delete;

    bool initialized_;
};

#endif // PHP_BRIDGE_H
