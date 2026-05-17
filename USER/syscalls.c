#include <sys/stat.h>
#include <errno.h>

int _close(int file)
{
	(void)file;
	errno = EBADF;
	return -1;
}

int _fstat(int file, struct stat *st)
{
	(void)file;
	st->st_mode = S_IFCHR;
	return 0;
}

int _isatty(int file)
{
	(void)file;
	return 1;
}

int _lseek(int file, int ptr, int dir)
{
	(void)file;
	(void)ptr;
	(void)dir;
	return 0;
}

int _read(int file, char *ptr, int len)
{
	(void)file;
	(void)ptr;
	(void)len;
	return 0;
}

int _write(int file, char *ptr, int len)
{
	(void)file;
	(void)ptr;
	return len;
}

void *_sbrk(int incr)
{
	extern char end;
	extern char _estack;
	static char *heap_end;
	char *prev_heap_end;

	if (heap_end == 0)
	{
		heap_end = &end;
	}

	prev_heap_end = heap_end;
	if (heap_end + incr > &_estack)
	{
		errno = ENOMEM;
		return (void *)-1;
	}

	heap_end += incr;
	return (void *)prev_heap_end;
}