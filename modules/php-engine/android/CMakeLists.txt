cmake_minimum_required(VERSION 3.10.2)
project(phparmengine)

set(CMAKE_CXX_STANDARD 17)

# Include C++ bridge source
add_library(
        phparmengine
        SHARED
        ../cpp/php_bridge.cpp
        cpp/phparmengine_jni.cpp
)

# Include directories for PHP headers and bridge
target_include_directories(
        phparmengine
        PRIVATE
        ../include
        ../cpp
        ${CMAKE_CURRENT_SOURCE_DIR}/../include
)

# Link libphp precompiled library based on target Android ABI (${ANDROID_ABI})
set(PHP_LIB_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../libs/android/${ANDROID_ABI}")

find_library(
        log-lib
        log
)

target_link_libraries(
        phparmengine
        PRIVATE
        ${PHP_LIB_DIR}/libphp.a
        ${log-lib}
)
