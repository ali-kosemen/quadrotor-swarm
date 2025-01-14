# Drone Simulator: Quadrotor Swarm

Based on:
https://github.com/Zhehui-Huang/quad-swarm-rl

## Citation

If you use this repository in your work or otherwise wish to cite it, please make reference to our following papers.

### QuadSwarm: A Modular Multi-Quadrotor Simulator for Deep Reinforcement Learning with Direct Thrust Control 
[ICRA Workshop: The Role of Robotics Simulators for Unmanned Aerial Vehicles, 2023](https://imrclab.github.io/workshop-uav-sims-icra2023/)

Drone Simulator for Reinforcement Learning.
```
@article{huang2023quadswarm,
  title={Quadswarm: A modular multi-quadrotor simulator for deep reinforcement learning with direct thrust control},
  author={Huang, Zhehui and Batra, Sumeet and Chen, Tao and Krupani, Rahul and Kumar, Tushar and Molchanov, Artem and Petrenko, Aleksei and Preiss, James A and Yang, Zhaojing and Sukhatme, Gaurav S},
  journal={arXiv preprint arXiv:2306.09537},
  year={2023}
}
```

### Sim-to-(Multi)-Real: Transfer of Low-Level Robust Control Policies to Multiple Quadrotors
IROS 2019

Single drone: a unified control policy adaptable to various types of physical quadrotors.
```
@inproceedings{molchanov2019sim,
  title={Sim-to-(multi)-real: Transfer of low-level robust control policies to multiple quadrotors},
  author={Molchanov, Artem and Chen, Tao and H{\"o}nig, Wolfgang and Preiss, James A and Ayanian, Nora and Sukhatme, Gaurav S},
  booktitle={2019 IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS)},
  pages={59--66},
  year={2019},
  organization={IEEE}
}
```
### Decentralized Control of Quadrotor Swarms with End-to-end Deep Reinforcement Learning
CoRL 2021

Multiple drones: a decentralized control policy for multiple drones in obstacle free environments.
```
@inproceedings{batra21corl,
  author    = {Sumeet Batra and
               Zhehui Huang and
               Aleksei Petrenko and
               Tushar Kumar and
               Artem Molchanov and
               Gaurav S. Sukhatme},
  title     = {Decentralized Control of Quadrotor Swarms with End-to-end Deep Reinforcement Learning},
  booktitle = {5th Conference on Robot Learning, CoRL 2021, 8-11 November 2021, London, England, {UK}},
  series    = {Proceedings of Machine Learning Research},
  publisher = {{PMLR}},
  year      = {2021},
  url       = {https://arxiv.org/abs/2109.07735}
}
```
### Collision Avoidance and Navigation for a Quadrotor Swarm Using End-to-end Deep Reinforcement Learning
ICRA 2024

Multiple drones: a decentralized control policy for multiple drones in obstacle dense environments.
```
@inproceedings{huang2024collision,
  title={Collision avoidance and navigation for a quadrotor swarm using end-to-end deep reinforcement learning},
  author={Huang, Zhehui and Yang, Zhaojing and Krupani, Rahul and {\c{S}}enba{\c{s}}lar, Bask{\i}n and Batra, Sumeet and Sukhatme, Gaurav S},
  booktitle={2024 IEEE International Conference on Robotics and Automation (ICRA)},
  pages={300--306},
  year={2024},
  organization={IEEE}
}
```
### HyperPPO: A scalable method for finding small policies for robotic control
ICRA 2024

A method to find the smallest control policy for deployment: train once, get tons of models with different size by using HyperNetworks.

We only need four neurons to control a quadrotor! That is super amazing!

Please check following videos for more details:
- [Square Grid Trajectory](https://www.youtube.com/watch?v=IenGT_TOwGQ&ab_channel=USCRESL)
- [Bezier Curve Trajectory](https://www.youtube.com/watch?v=B5EpKlD5F68&ab_channel=USCRESL)
```
@inproceedings{hegde2024hyperppo,
  title={Hyperppo: A scalable method for finding small policies for robotic control},
  author={Hegde, Shashank and Huang, Zhehui and Sukhatme, Gaurav S},
  booktitle={2024 IEEE International Conference on Robotics and Automation (ICRA)},
  pages={10821--10828},
  year={2024},
  organization={IEEE}
}
```
