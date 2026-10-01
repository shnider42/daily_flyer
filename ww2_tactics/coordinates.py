"""Spreadsheet-style hex columns beyond Z."""
def column(x):
    value = ''
    while x >= 0:
        value = chr(65+x%26) + value
        x = x//26-1
    return value
