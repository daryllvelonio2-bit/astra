Pod::Spec.new do |s|
  s.name         = "PHPEngine"
  s.version      = "1.0.0"
  s.summary      = "Embedded PHP and Laravel engine for React Native / Expo"
  s.homepage     = "https://github.com/example/phparmengine"
  s.license      = "MIT"
  s.author       = { "Author" => "developer@example.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/example/phparmengine.git", :tag => "#{s.version}" }

  s.source_files = "cpp/**/*.{h,cpp}", "ios/**/*.{h,m,mm,cpp}"
  s.public_header_files = "cpp/**/*.h"

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => '"$(PODS_ROOT)/../../modules/php-engine/include"'
  }

  s.vendored_libraries = "libs/ios/libphp.a"

  s.dependency "React-Core"
end
