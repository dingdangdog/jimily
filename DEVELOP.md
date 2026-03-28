
```dockerfile
docker build -t jimily:5.1.1 .
docker save -o jimily.5.1.1.tar jimily:5.1.1
docker load -i jimily.5.1.1.tar
```
