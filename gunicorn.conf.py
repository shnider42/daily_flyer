"""Worker-owned DSL services, safe with and without Gunicorn --preload."""
import faulthandler
import os


def post_worker_init(worker):
    app = worker.wsgi
    queue = getattr(app, 'extensions', {}).get('ww2_computer_queue')
    if queue is None:
        return
    if os.environ.get('RENDER'):
        # The watchdog belongs to this worker, never to the preloading master.
        # A successful HTTP/database health check cancels it.
        faulthandler.dump_traceback_later(45, repeat=True)
        app.config['WW2_STARTUP_TRACE'] = True
    if app.config['WW2_BACKGROUND_AI']:
        queue.start()
        worker.log.info('DSL computer queue started in worker pid %s', os.getpid())


def worker_exit(server, worker):
    queue = getattr(getattr(worker, 'wsgi', None), 'extensions', {}).get('ww2_computer_queue')
    if queue is not None:
        queue.stop()
