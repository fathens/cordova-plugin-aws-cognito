#!/bin/bash

cat > Gemfile <<EOF
source 'https://rubygems.org'

gem "fetch_local_lib", :git => "https://github.com/fathens/fetch_local_lib.git"
gem "cordova_plugin_kotlin", :git => "https://github.com/fathens/Cordova-Plugin-Kotlin.git"
EOF

bundle install && bundle update

bundle exec ruby <<EOF
require 'pathname'
require 'cordova_plugin_kotlin'

PLATFORM_DIR = Pathname('$0').realpath.dirname

Kotlin::mk_skeleton PLATFORM_DIR

log "Generating project done"
log "Open by AndroidStudio. Thank you."
EOF
