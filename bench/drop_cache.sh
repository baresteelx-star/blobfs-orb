#!/bin/sh
# Flush dirty pages and drop the Linux page cache, dentries and inodes (needs passwordless sudo).
sync && sudo -n sh -c 'echo 3 > /proc/sys/vm/drop_caches'
