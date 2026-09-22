cmake_minimum_required(VERSION 3.22.1)
project(ptysession)

add_library(ptysession SHARED pty_session.c)

find_library(log-lib log)
target_link_libraries(ptysession ${log-lib})
