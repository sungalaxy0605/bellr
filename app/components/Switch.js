import ReactSwitch from 'react-switch';
 
class Switch extends React.Component {
  constructor(props) {
    super(props);
  }
 
  handleChange = (checked) => {
    this.props.handleChange(this.props.stateKey, checked);
  }
 
  render() {
    return (
      <ReactSwitch
        onChange={this.handleChange}
        checked={this.props.isEnabled}
        width={34}
        height={16}
        uncheckedIcon={false}
        checkedIcon={false}
        handleDiameter={20}
        onColor={'#bbe5b3'}
        offColor={'#dfe3e8'}
        onHandleColor={'#50b83c'}
        offHandleColor={'#c4cdd5'}
        className={'switch-container'}
      />
    );
  }
}

export default Switch;