#include "php_bridge.h"

#include <iostream>
#include <sstream>
#include <mutex>
#include <unistd.h>
#include <sys/stat.h>

// Include PHP Embed headers (conditional or mock/stub if compiling without headers present in test environment, but structured for real PHP embed SAPI)
#ifdef PHP_EMBED_ENABLED
extern "C" {
#include <php.h>
#include <php_main.h>
#include <sapi/embed/php_embed.h>
#include <zend_execute.h>
}
#endif

static std::mutex php_mutex;
static thread_local std::string* current_output_buffer = nullptr;

#ifdef PHP_EMBED_ENABLED
static size_t php_ub_write_handler(const char *str, size_t str_len) {
    if (current_output_buffer) {
        current_output_buffer->append(str, str_len);
    }
    return str_len;
}
#endif

PhpBridge& PhpBridge::getInstance() {
    static PhpBridge instance;
    return instance;
}

PhpBridge::PhpBridge() : initialized_(false) {}

PhpBridge::~PhpBridge() {
    shutdown();
}

bool PhpBridge::initialize() {
    std::lock_guard<std::mutex> lock(php_mutex);
    if (initialized_) return true;

#ifdef PHP_EMBED_ENABLED
    // Configure embed SAPI callbacks before init
    // embed_sapi_module.ub_write = php_ub_write_handler;
    // embed_sapi_module.ini_defaults = ...
    
    if (php_embed_init(0, NULL) == FAILURE) {
        return false;
    }
#endif

    initialized_ = true;
    return true;
}

void PhpBridge::shutdown() {
    std::lock_guard<std::mutex> lock(php_mutex);
    if (!initialized_) return;

#ifdef PHP_EMBED_ENABLED
    php_embed_shutdown();
#endif

    initialized_ = false;
}

std::string PhpBridge::evalPhp(const std::string& code) {
    std::lock_guard<std::mutex> lock(php_mutex);
    std::string output;
    current_output_buffer = &output;

    if (!initialized_) {
        // Auto-initialize if needed
        // (In production, ensure thread safety and proper lifecycle)
    }

#ifdef PHP_EMBED_ENABLED
    php_request_startup();
    
    // Execute PHP code string
    zend_eval_string((char*)code.c_str(), nullptr, "php_bridge_eval");

    php_request_shutdown();
#else
    output = "[Mock PHP Output] Evaluated: " + code;
#endif

    current_output_buffer = nullptr;
    return output;
}

std::string PhpBridge::runArtisan(const std::vector<std::string>& args, const std::string& projectPath) {
    std::lock_guard<std::mutex> lock(php_mutex);
    std::string output;
    current_output_buffer = &output;

    // Change working directory to Laravel project root
    char old_cwd[1024];
    if (getcwd(old_cwd, sizeof(old_cwd)) != nullptr) {
        chdir(projectPath.c_str());
    }

#ifdef PHP_EMBED_ENABLED
    php_request_startup();

    // Prepare argc / argv for artisan script
    int argc = args.size() + 1;
    char** argv = new char*[argc];
    argv[0] = (char*)"artisan";
    for (size_t i = 0; i < args.size(); ++i) {
        argv[i + 1] = (char*)args[i].c_str();
    }

    // Run artisan file
    zend_file_handle file_handle;
    zend_stream_init_filename(&file_handle, "artisan");
    if (file_handle.opened_path) {
        php_execute_script(&file_handle);
    }

    delete[] argv;
    php_request_shutdown();
#else
    output = "[Mock Artisan] Ran command in " + projectPath;
#endif

    chdir(old_cwd);
    current_output_buffer = nullptr;
    return output;
}

std::string PhpBridge::dispatchLaravel(
    const std::string& method,
    const std::string& uri,
    const std::map<std::string, std::string>& headers,
    const std::string& body,
    const std::string& projectPath
) {
    std::lock_guard<std::mutex> lock(php_mutex);
    std::string output;
    current_output_buffer = &output;

    char old_cwd[1024];
    if (getcwd(old_cwd, sizeof(old_cwd)) != nullptr) {
        // Laravel public index expects cwd to be public/ or project root with correct script filename
        std::string public_path = projectPath + "/public";
        chdir(public_path.c_str());
    }

#ifdef PHP_EMBED_ENABLED
    php_request_startup();

    // Inject superglobals ($_SERVER, $_GET, $_POST, etc.)
    zval* carrier = zend_hash_str_find(&EG(symbol_table), ZEND_STRL("_SERVER"));
    if (carrier && Z_TYPE_P(carrier) == IS_ARRAY) {
        add_assoc_string(carrier, "REQUEST_METHOD", (char*)method.c_str());
        add_assoc_string(carrier, "REQUEST_URI", (char*)uri.c_str());
        // Add headers into $_SERVER
        for (const auto& pair : headers) {
            std::string server_key = "HTTP_" + pair.first;
            for (auto& c : server_key) {
                if (c == '-') c = '_';
                c = toupper(c);
            }
            add_assoc_string(carrier, server_key.c_str(), (char*)pair.second.c_str());
        }
    }

    // Execute public/index.php
    zend_file_handle file_handle;
    zend_stream_init_filename(&file_handle, "index.php");
    if (file_handle.opened_path) {
        php_execute_script(&file_handle);
    }

    php_request_shutdown();
#else
    output = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n[Mock Laravel Response] Method: " + method + ", URI: " + uri;
#endif

    chdir(old_cwd);
    current_output_buffer = nullptr;
    return output;
}
