"""Print how many bytes of a file are resident in the page cache (mincore(2) via ctypes). usage: python bench/resident.py file"""
import ctypes, mmap, os, sys
p = sys.argv[1]; size = os.path.getsize(p); PG = mmap.PAGESIZE
libc = ctypes.CDLL(None, use_errno=True)
libc.mmap.restype = ctypes.c_void_p
libc.mmap.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_long]
fd = os.open(p, os.O_RDONLY)
addr = libc.mmap(None, size, mmap.PROT_READ, mmap.MAP_SHARED, fd, 0)
n = (size + PG - 1) // PG; vec = (ctypes.c_ubyte * n)()
if libc.mincore(ctypes.c_void_p(addr), ctypes.c_size_t(size), vec) != 0: raise OSError(ctypes.get_errno(), "mincore")
print(sum(v & 1 for v in vec) * PG)
